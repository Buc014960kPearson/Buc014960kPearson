import axios from 'axios'

const gistId = process.env.GIST_ID
const token = 'ghp_' + process.env.GIST_TOKEN
const matrixId = process.env.MATRIX_JOB
const total = Number(process.env.TOTAL_JOBS)

if (!gistId || !token || !matrixId || !total) {
  console.error('Missing environment variables')
  process.exit(1)
}

const headers = {
  Authorization: `token ${token}`,
  Accept: 'application/vnd.github.v3+json',
}

const url = `https://api.github.com/gists/${gistId}`
const filename = 'matrix-barrier.json'

async function fetchArrived(): Promise<string[]> {
  const res = await axios.get(url, { headers })

  const file = res.data.files?.[filename]
  if (!file) {
    console.error(`⛔ Gist 中找不到文件: ${filename}`)
    process.exit(1)
  }

  try {
    const content = JSON.parse(file.content)
    return content.arrived || []
  } catch {
    console.warn('⚠️ JSON 解析失败，重置为空')
    return []
  }
}

async function updateArrived(arrived: string[]): Promise<boolean> {
  const body = {
    files: {
      [filename]: {
        content: JSON.stringify({ arrived }, null, 2),
      },
    },
  }

  try {
    await axios.patch(url, body, { headers })
    return true
  } catch (err: any) {
    console.error(`⚠️ PATCH 失败: ${err.response?.status} ${err.response?.statusText}`)
    return false
  }
}

async function registerWithRetry(maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const arrived = await fetchArrived()
    if (arrived.includes(matrixId)) {
      console.log(`[${matrixId}] 已经注册，无需重复`)
      return
    }

    const merged = Array.from(new Set([...arrived, matrixId]))

    const success = await updateArrived(merged)
    if (success) {
      console.log(`[${matrixId}] 成功注册`)
      return
    } else {
      const wait = 500 + Math.random() * 500
      console.log(`[${matrixId}] 写入失败，${Math.round(wait)}ms 后重试 (${i + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, wait))
    }
  }

  console.error(`[${matrixId}] 重试多次后仍然失败，退出`)
  process.exit(1)
}

async function waitForOthers() {
  await registerWithRetry()

  while (true) {
    const arrived = await fetchArrived()
    const count = arrived.length

    if (count >= total) {
      console.log(`[${matrixId}] 全部 ${count}/${total} 到达，继续执行`)
      break
    }

    console.log(`[${matrixId}] 等待中... (${count}/${total})`)
    await new Promise(r => setTimeout(r, 3000))
  }
}

waitForOthers().catch(err => {
  console.error('❌ 程序异常终止:', err)
  process.exit(1)
})
