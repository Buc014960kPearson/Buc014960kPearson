import axios from 'axios'

const gistId = process.env.GIST_ID
const token = 'ghp_' + process.env.GIST_TOKEN
const matrixId = process.env.MATRIX_JOB
const total = Number(process.env.TOTAL_JOBS)

if (!gistId || !token || !matrixId || !total) {
  console.error('❌ 缺少环境变量')
  process.exit(1)
}

const headers = {
  Authorization: `token ghp_${process.env.GIST_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
}

const url = `https://api.github.com/gists/${gistId}`
const filename = 'matrix-barrier.json'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchArrived(): Promise<string[]> {
  try {
    const res = await axios.get(url, { headers })
    const file = res.data.files?.[filename]
    if (!file) {
      console.error(`❌ Gist 中不存在文件 ${filename}`)
      process.exit(1)
    }

    const content = JSON.parse(file.content || '{}')
    return Array.isArray(content.arrived) ? content.arrived : []
  } catch (err) {
    console.error('❌ 获取 Gist 内容失败', err)
    return []
  }
}

async function safeRegister(retries = 10): Promise<void> {
  for (let i = 0; i < retries; i++) {
    const arrived = await fetchArrived()

    if (arrived.includes(matrixId)) {
      console.log(`[${matrixId}] 已在列表中`)
      return
    }

    const merged = Array.from(new Set([...arrived, matrixId]))

    const body = {
      files: {
        [filename]: {
          content: JSON.stringify({ arrived: merged }, null, 2),
        },
      },
    }

    try {
      await axios.patch(url, body, { headers })
      console.log(`[${matrixId}] 成功注册 (写入 ${merged.length} 项)`)
      return
    } catch (err) {
      console.warn(`[${matrixId}] PATCH 写入失败，重试中 (${i + 1}/${retries})`)
      await sleep(500 + Math.random() * 500)
    }
  }

  console.error(`[${matrixId}] 写入重试失败，放弃`)
  process.exit(1)
}

async function waitForAll() {
  await safeRegister()

  while (true) {
    const arrived = await fetchArrived()
    const current = arrived.length

    if (arrived.includes(matrixId)) {
      if (current >= total) {
        console.log(`[${matrixId}] 所有任务已到达 (${current}/${total})，继续执行`)
        break
      } else {
        console.log(`[${matrixId}] 等待其他任务 (${current}/${total})`)
      }
    } else {
      // 如果当前不在列表中（被覆盖了），重新注册
      console.warn(`[${matrixId}] 被覆盖，重新注册`)
      await safeRegister()
    }

    await sleep(3000)
  }
}

waitForAll().catch(err => {
  console.error('❌ 执行出错', err)
  process.exit(1)
})
