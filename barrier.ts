import axios from 'axios'

const gistId = process.env.GIST_ID
const token = 'ghp_' + process.env.GIST_TOKEN
const matrixId = process.env.MATRIX_JOB
const total = Number(process.env.TOTAL_JOBS)

if (!gistId || !token || !matrixId || !total) {
  console.error('Missing environment variables')
  process.exit(1)
}

const headersBase = {
  Authorization: `token ${token}`,
  Accept: 'application/vnd.github.v3+json',
}

const url = `https://api.github.com/gists/${gistId}`
const filename = 'matrix-barrier.json'

interface ArrivedData {
  arrived: string[]
}

async function fetchGist(): Promise<{ arrived: string[], etag: string }> {
  const res = await axios.get(url, {
    headers: headersBase,
  })

  const files = res.data.files
  const file = files[filename]
  if (!file) {
    console.error(`⛔ 文件 "${filename}" 不存在于指定 Gist 中，请确认名字拼写是否正确`)
    process.exit(1)
  }

  const fileContent = file.content || '{"arrived":[]}'
  const etag = res.headers.etag || ''
  let arrived: string[] = []

  try {
    const parsed: ArrivedData = JSON.parse(fileContent)
    arrived = parsed.arrived || []
  } catch {
    console.warn('⚠️ 无法解析 JSON，默认空列表')
  }

  return { arrived, etag }
}

async function tryPatch(arrived: string[], etag: string): Promise<boolean> {
  const body = {
    files: {
      [filename]: {
        content: JSON.stringify({ arrived }, null, 2),
      },
    },
  }

  try {
    await axios.patch(url, body, {
      headers: {
        ...headersBase,
        'If-Match': etag,
      },
    })
    return true
  } catch (err: any) {
    if (err.response) {
      console.error(
        `Patch error ${err.response.status}: ${err.response.statusText}`,
        err.response.data
      )
    } else {
      console.error(`Patch error:`, err.message)
    }
    return false
  }
}

async function registerSafely(maxRetries = 10) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { arrived, etag } = await fetchGist()

    if (arrived.includes(matrixId)) {
      return
    }

    const newArrived = [...new Set([...arrived, matrixId])]
    const success = await tryPatch(newArrived, etag)
    if (success) {
      console.log(`[${matrixId}] Registered successfully`)
      return
    } else {
      console.log(`[${matrixId}] Conflict or error. Retrying... (${attempt + 1})`)
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500)) // jitter
    }
  }

  console.error(`[${matrixId}] Failed to register after retries`)
  process.exit(1)
}

async function waitForOthers() {
  await registerSafely()

  while (true) {
    const { arrived } = await fetchGist()
    const count = arrived.length

    if (count >= total) {
      console.log(`[${matrixId}] All jobs arrived. Proceeding.`)
      break
    }

    console.log(`[${matrixId}] Waiting... (${count}/${total})`)
    await new Promise(r => setTimeout(r, 3000))
  }
}

waitForOthers().catch(err => {
  console.error(err)
  process.exit(1)
})
