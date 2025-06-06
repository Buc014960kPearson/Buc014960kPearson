import * as util from 'util';
import * as moment from 'moment';
import { Server } from 'socket.io';
import * as http from 'http';

Date.prototype[util.inspect.custom] = function () {
  return moment(this).format('YYYY-MM-DD HH:mm:ss.SSS');
};

Date.prototype.toString = function () {
  return moment(this).format('YYYY-MM-DD HH:mm:ss.SSS');
};

const log = console.log;
console.log = function (...args) {
  log("log:", new Date(), ...args);
};

const error = console.error;
console.error = function (...args) {
  error("error:", new Date(), ...args);
  error(new Error().stack.split('\n').slice(2).join('\n'));
};

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: '*' },
});

type RunState = {
  arrived: Set<string>;
  total: number;
  sockets: Map<string, string>;
};

const runs = new Map<string, RunState>();

io.on('connection', (socket) => {
  // 从 handshake.query 获取参数
  const { matrixId, runId, total } = socket.handshake.query as { matrixId?: string, runId?: string, total?: string };

  if (
    typeof matrixId !== 'string' ||
    typeof runId !== 'string' ||
    typeof total !== 'string' ||
    isNaN(Number(total)) ||
    Number(total) <= 0
  ) {
    socket.disconnect(true);
    return;
  }

  const totalNum = Number(total);

  if (!runs.has(runId)) {
    runs.set(runId, { arrived: new Set(), total: totalNum, sockets: new Map() });
  }

  const state = runs.get(runId)!;

  if (state.total !== totalNum) {
    console.error(`❌ [${runId}] 冲突：已有 total=${state.total}，当前客户端传入 total=${totalNum}`);
    socket.disconnect(true);
    return;
  }

  if (!state.arrived.has(matrixId)) {
    state.arrived.add(matrixId);
    state.sockets.set(matrixId, socket.id);
    console.log(`✅ [${runId}] ${matrixId} 到达 (${state.arrived.size}/${state.total})`);
  } else {
    state.sockets.set(matrixId, socket.id);
    console.log(`🔁 [${runId}] ${matrixId} 已存在`);
  }

  io.emit(`update:${runId}`, { current: state.arrived.size });

  if (state.arrived.size >= state.total) {
    io.emit(`ready:${runId}`);
    runs.delete(runId);
    console.log(`🧹 [${runId}] 状态已清除`);
  }

  socket.on('disconnect', () => {
    const state = runs.get(runId);
    if (state && state.arrived.has(matrixId)) {
      if (state.sockets.get(matrixId) === socket.id) {
        state.arrived.delete(matrixId);
        state.sockets.delete(matrixId);
        console.log(`⚠️ [${runId}] ${matrixId} 断开，当前到达数：${state.arrived.size}/${state.total}`);
        io.emit(`update:${runId}`, { current: state.arrived.size });
      }
    }
  });
});

const PORT = 80;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO 服务运行在 http://localhost:${PORT}`);
});