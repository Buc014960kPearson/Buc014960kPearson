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

async function getArrived(): Promise<string[]> {
  const res = await axios.get(url, { headers })
  const fileContent = res.data.files[filename]?.content || '{"arrived":[]}'
  try {
    const data = JSON.parse(fileContent)
    return data.arrived || []
  } catch {
    return []
  }
}

async function updateArrived(arrived: string[]): Promise<void> {
  const newContent = {
    files: {
      [filename]: {
        content: JSON.stringify({ arrived }, null, 2),
      },
    },
  }
  await axios.patch(url, newContent, { headers })
}

async function registerWithRetry(retry = 5): Promise<void> {
  while (retry-- > 0) {
    const arrived = await getArrived()
    if (arrived.includes(matrixId)) {
      return
    }

    const updated = [...arrived, matrixId]
    try {
      await updateArrived(updated)
      return
    } catch (err) {
      console.warn(`[${matrixId}] Patch failed, retrying... (${retry} left)`)
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  console.error(`[${matrixId}] Failed to register after retries`)
  process.exit(1)
}

async function waitForOthers(): Promise<void> {
  await registerWithRetry()

  while (true) {
    const arrived = await getArrived()
    if (arrived.length >= total) {
      console.log(`[${matrixId}] All jobs arrived. Proceeding.`)
      break
    }

    console.log(`[${matrixId}] Waiting... (${arrived.length}/${total})`)
    await new Promise((r) => setTimeout(r, 3000))
  }
}

waitForOthers().catch((err) => {
  console.error(err)
  process.exit(1)
})
