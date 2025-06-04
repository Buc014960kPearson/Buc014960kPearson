import { Server } from 'socket.io';
import * as http from 'http';

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: '*' },
});

type RunState = {
  arrived: Set<string>;
  total: number;
};

const runs = new Map<string, RunState>();

io.on('connection', (socket) => {
  socket.on(
    'register',
    (
      {
        matrixId,
        runId,
        total,
      }: { matrixId: string; runId: string; total: number },
      ack: (response: { success: boolean; current: number }) => void
    ) => {
      if (
        typeof matrixId !== 'string' ||
        typeof runId !== 'string' ||
        typeof total !== 'number' ||
        total <= 0
      ) {
        ack({ success: false, current: 0 });
        return;
      }

      if (!runs.has(runId)) {
        runs.set(runId, { arrived: new Set(), total });
      }

      const state = runs.get(runId)!;

      if (state.total !== total) {
        console.error(
          `❌ [${runId}] 冲突：已有 total=${state.total}，当前客户端传入 total=${total}`
        );
        ack({ success: false, current: state.arrived.size });
        return;
      }

      if (!state.arrived.has(matrixId)) {
        state.arrived.add(matrixId);
        console.log(`✅ [${runId}] ${matrixId} 到达 (${state.arrived.size}/${state.total})`);
      } else {
        console.log(`🔁 [${runId}] ${matrixId} 已存在`);
      }

      ack({ success: true, current: state.arrived.size });

      io.emit(`update:${runId}`, { current: state.arrived.size });

      if (state.arrived.size >= state.total) {
        io.emit(`ready:${runId}`);
        runs.delete(runId); // ✅ 到达后清除状态
        console.log(`🧹 [${runId}] 状态已清除`);
      }
    }
  );
});

const PORT = 80;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO 服务运行在 http://localhost:${PORT}`);
});
