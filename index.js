const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeInMemoryStore, delay } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const axios = require('axios');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

const CREATOR_NAME = process.env.CREATOR_NAME || "Desconhecido";

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log("✅ Bot conectado com sucesso!");
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const message = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // !creator
        if (message.startsWith("!creator")) {
            await sock.sendMessage(from, { text: `👨‍💻 Criador: ${CREATOR_NAME}` });
        }

        // !findip 8.8.8.8
        if (message.startsWith("!findip")) {
            const ip = message.split(" ")[1];
            if (!ip) {
                await sock.sendMessage(from, { text: "❌ Você precisa fornecer um IP. Ex: !findip 8.8.8.8" });
                return;
            }

            try {
                const res = await axios.get(`http://ip-api.com/json/${ip}`);
                const data = res.data;
                if (data.status === "fail") {
                    await sock.sendMessage(from, { text: `❌ IP inválido.` });
                } else {
                    await sock.sendMessage(from, {
                        text: `📍 IP Encontrado:\n- País: ${data.country}\n- Região: ${data.regionName}\n- Cidade: ${data.city}\n- ISP: ${data.isp}\n- Org: ${data.org}\n- Timezone: ${data.timezone}`
                    });
                }
            } catch (err) {
                await sock.sendMessage(from, { text: "❌ Erro ao buscar IP." });
            }
        }

        // !sticker (responde a uma imagem)
        if (message.startsWith("!sticker") && msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
            const quoted = msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
            const buffer = await downloadMedia(quoted, sock);
            await sock.sendMessage(from, { sticker: buffer }, { quoted: msg });
        }
    });

    async function downloadMedia(message, sock) {
        const stream = await sock.downloadMediaMessage({ message });
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    }
}

startBot();
