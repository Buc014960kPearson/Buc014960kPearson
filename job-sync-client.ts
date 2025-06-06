import * as util from 'util';
import * as moment from 'moment';
import { io, Socket } from 'socket.io-client';

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

const matrixId = process.env.MATRIX_JOB_ID;
const total = Number(process.env.TOTAL_JOBS);
const runId = process.env.RUN_ID;
const serverUrl = process.env.SOCKET_SERVER_URL;

console.log("matrixId", matrixId);
console.log("total", total);
console.log("runId", runId);

if (!matrixId || !total || !runId) {
  console.error('❌ 缺少环境变量 MATRIX_JOB_ID、MATRIX_JOB_COUNT 或 RUN_ID');
  process.exit(1);
}

let socket: Socket;

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    socket = io(serverUrl, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      query: {
        matrixId,
        runId,
        total: String(total),
      },
    });

    socket.on('connect', () => {
      console.log(`[${matrixId}] ✅ 成功连接到服务器 ${serverUrl}`);
      resolve();
    });

    socket.on('connect_error', (err) => {
      console.error(`[${matrixId}] ❌ 无法连接到服务器`, err);
      reject(err);
    });

    socket.on('disconnect', (reason) => {
      console.error(`[${matrixId}] ⚠️ 断开连接，原因: ${reason}`);
    });
  });
}

async function waitForAll(): Promise<void> {
  await connect();

  return new Promise<void>((resolve) => {
    socket.on(`update:${runId}`, (data: { current: number }) => {
      console.log(`[${matrixId}] 📦 当前进度 ${data.current}/${total}`);
    });

    socket.on(`ready:${runId}`, () => {
      console.log(`[${matrixId}] 🚀 所有任务已到达，继续执行`);
      socket.disconnect();
      resolve();
    });
  });
}

if (require.main === module) {
  waitForAll().catch((err) => {
    console.error('❌ 执行出错', err);
    process.exit(1);
  });
}