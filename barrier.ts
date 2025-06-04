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

  const fileContent = res.data.files[filename]?.content || '{"arrived":[]}'
  const etag = res.headers.etag || ''
  let arrived: string[] = []

  try {
    const parsed: ArrivedData = JSON.parse(fileContent)
    arrived = parsed.arrived || []
  } catch (e) {
    console.error('Failed to parse Gist content')
  }

  return { arrived, etag }
}

async function tryPatch(arrived: string[], etag: string): Promise<boolean> {
  const newContent = {
    files: {
      [filename]: {
        content: JSON.stringify({ arrived }, null, 2),
      },
    },
  }

  try {
    await axios.patch(url, newContent, {
      headers: {
        ...headersBase,
        'If-Match': etag,
      },
    })
    return true
  } catch (err: any) {
    if (err.response?.status === 412) {
      // ETag 不匹配
      return false
    } else {
      console.error('Patch error', err.message)
      throw new Error('Patch error')
    }
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
      console.log(`[${matrixId}] Conflict detected. Retrying... (${attempt + 1})`)
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
