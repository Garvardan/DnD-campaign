const { requestUrl, Notice } = obsidian;

// ================================
// НАСТРОЙКИ
// ================================

const WEBHOOK_URL = "https://discord.com/api/webhooks/1553383742683226124/Jkje5QoP4U-ebzfBzU9UWJdsZ3pQ8ZBTAaRbsSS7fP93XbH-BMEydKFcuRR_HJcqHxTv";

// Формула передаётся из Meta Bind.
// Если ничего не передано — бросается 1d20.
const formula = context.args?.formula ?? "1d20";

const file = app.workspace.getActiveFile();
const frontmatter =
    app.metadataCache.getFileCache(file)?.frontmatter ?? {};
const portraitPath = frontmatter.portrait ?? null;
const portrait = frontmatter.portrait ?? null;


// ================================
// БРОСОК
// ================================

if (!window.DiceRoller) {
    new Notice("Dice Roller API не найден.");
    return;
}

const file = app.workspace.getActiveFile();

const { result, roller } = await window.DiceRoller.parseDice(
    formula,
    file?.path ?? ""
);

const diceResult = roller.children[0].result;
const bonus = result - diceResult;
const rollName = context.args?.name ?? "Бросок";

let details = `${roller.children[0].display}`;

if (bonus > 0) {
    details += ` + ${bonus}`;
} else if (bonus < 0) {
    details += ` - ${Math.abs(bonus)}`;
}

if (result === undefined || result === null) {
    new Notice("Не удалось выполнить бросок.");
    return;
}

function combineModifiers(text) {
    return text.replace(
        /((?:\s*[+-]\s*\d+){2,})/g,
        (part) => {
            const numbers = [...part.matchAll(/([+-])\s*(\d+)/g)];

            const total = numbers.reduce((sum, match) => {
                const value = Number(match[2]);
                return match[1] === "-" ? sum - value : sum + value;
            }, 0);

            if (total > 0) return ` + ${total}`;
            if (total < 0) return ` - ${Math.abs(total)}`;
            return "";
        }
    );
}

// ================================
// DISCORD + ПОРТРЕТ
// ================================

const portraitFile = portraitPath
    ? app.vault.getAbstractFileByPath(portraitPath)
    : null;


// Если портрета нет — отправляем обычное сообщение
if (!(portraitFile instanceof obsidian.TFile)) {

    await requestUrl({
        url: WEBHOOK_URL,
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
            embeds: [
                {
                    title: rollName,
                    description: `🎲 ${details} = **${result}**`
                }
            ]
        })
    });

} else {

    // Читаем картинку с диска
    const imageBuffer =
        await app.vault.adapter.readBinary(portraitFile.path);

    const extension =
        portraitFile.extension.toLowerCase();

    const mimeTypes = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif"
    };

    const mimeType =
        mimeTypes[extension] ?? "application/octet-stream";

    // Имя специально делаем простым,
    // чтобы Discord нормально использовал attachment://
    const discordFileName = `portrait.${extension}`;


    // Embed
    const payload = {
        embeds: [
            {
                title: rollName,

                description:
                    `🎲 ${details} = **${result}**`,

                thumbnail: {
                    url: `attachment://${discordFileName}`
                }
            }
        ],

        attachments: [
            {
                id: 0,
                filename: discordFileName
            }
        ]
    };


    // ================================
    // MULTIPART BODY
    // ================================

    const boundary =
        `----ObsidianDiscord${Date.now()}`;

    const encoder = new TextEncoder();

    const payloadPart = encoder.encode(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="payload_json"\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${JSON.stringify(payload)}\r\n` +

        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="files[0]"; filename="${discordFileName}"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`
    );

    const imageBytes =
        new Uint8Array(imageBuffer);

    const endPart = encoder.encode(
        `\r\n--${boundary}--\r\n`
    );


    // Склеиваем JSON + картинку
    const body = new Uint8Array(
        payloadPart.length +
        imageBytes.length +
        endPart.length
    );

    body.set(payloadPart, 0);

    body.set(
        imageBytes,
        payloadPart.length
    );

    body.set(
        endPart,
        payloadPart.length + imageBytes.length
    );


    // Отправка
    await requestUrl({
        url: WEBHOOK_URL,
        method: "POST",

        headers: {
            "Content-Type":
                `multipart/form-data; boundary=${boundary}`
        },

        body: body.buffer
    });
}

new Notice(`🎲 ${formula} → ${result}`);