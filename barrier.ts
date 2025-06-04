import axios from 'axios'

const gistId = process.env.GIST_ID
const token = "ghp_" + process.env.GIST_TOKEN
const matrixId = process.env.MATRIX_JOB
const total = Number(process.env.TOTAL_JOBS)

if (!gistId || !token) {
  console.error('Missing GIST_ID or GIST_TOKEN')
  process.exit(1)
}

const headers = {
  Authorization: `token ${token}`,
  // 'User-Agent': 'barrier-script',
  Accept: 'application/vnd.github.v3+json',
}

const url = `https://api.github.com/gists/${gistId}`
const filename = 'matrix-barrier.json'

async function waitForOthers() {
  while (true) {
    const res = await axios.get(url, { headers })
    const fileContent = res.data.files[filename]?.content || '{"arrived":[]}'
    console.log("fileContent", fileContent)
    let arrived = []

    try {
      const data = JSON.parse(fileContent)
      arrived = data.arrived || []
    } catch (err) {
      console.error('Failed to parse Gist content')
      process.exit(1)
    }

    if (!arrived.includes(matrixId)) {
      arrived.push(matrixId)
      const newContent = {
        files: {
          [filename]: {
            content: JSON.stringify({ arrived }, null, 2),
          },
        },
      }

      await axios.patch(url, newContent, { headers })
      console.log(`[${matrixId}] Registered at barrier`)
    }

    if (arrived.length >= total) {
      console.log(`[${matrixId}] All jobs arrived. Proceeding.`)
      break
    }

    console.log(`[${matrixId}] Waiting... (${arrived.length}/${total})`)
    await new Promise((r) => setTimeout(r, 3000))
  }
}

waitForOthers()
