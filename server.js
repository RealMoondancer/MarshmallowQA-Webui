// server.js
const path = require('path')
const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const cheerio = require('cheerio')

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

// in‐memory store: uuid → items array
const messageStore = new Map()

// serve any files in /public
app.use(express.static(path.join(__dirname, 'public')))

// WebSocket logic
wss.on('connection', ws => {
    console.log('Client connected')

    ws.on('message', message => {
        let msg
        try {
            msg = JSON.parse(message)
        } catch {
            return
        }
        if (msg.type === 'page-content') {
            console.log(`→ page-content (uuid=${msg.uuid}) from ${msg.url}`)
            const $ = cheerio.load(msg.content)
            const $ul = $('#messages')
            let found = false
            let items = []

            if ($ul.length) {
                found = true
                items = $ul
                    .find('li')
                    .map((i, li) => {
                        const $divs = $(li).children('div')
                        const $a = $divs.eq(1).find('a')
                        $a.find('img').each((j, img) => {
                            const alt = $(img).attr('alt') || ''
                            $(img).replaceWith(alt)
                        })
                        return $a.text().trim()
                    })
                    .get()
                    .filter(text => text.length > 0)
            }

            // store for later
            messageStore.set(msg.uuid, items)

            // ACK back
            ws.send(
                JSON.stringify({
                    type: 'ack',
                    uuid: msg.uuid,
                    status: 'received',
                    found,
                    items
                })
            )
        } else if (msg.type === 'delete') {
            // remove from in-memory store
            if (messageStore.delete(msg.uuid)) {
                console.log(`Deleted stored messages for uuid=${msg.uuid}`);
                ws.send(JSON.stringify({
                    type: 'deleted',
                    uuid: msg.uuid,
                    status: 'deleted'
                }));
            }
        }
    })

    ws.on('close', () => {
        console.log('Client disconnected')
    })
})

// JSON API for interactive page
app.get('/api/messages/:uuid', (req, res) => {
    const items = messageStore.get(req.params.uuid)
    if (!items) return res.status(404).json({ error: 'UUID not found' })
    res.json({ uuid: req.params.uuid, items })
})

// Serve the standalone HTML viewer
app.get('/interactive/:uuid', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'interactive.html'))
})

const PORT = 3000
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`)
})
