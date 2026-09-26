const { requestUrl, Notice, TFile } = obsidian;

// ================================
// НАСТРОЙКИ
// ================================

const WEBHOOK_URL = "ТВОЙ_WEBHOOK";

const formula = context.args?.formula ?? "1d20";
const rollName = context.args?.name ?? "Бросок";


// ================================
// ДАННЫЕ ПЕРСОНАЖА
// ================================

const file = app.workspace.getActiveFile();

if (!file) {
    new Notice("Активный файл не найден.");
    return;
}

const frontmatter =
    app.metadataCache.getFileCache(file)?.frontmatter ?? {};

const portraitValue = frontmatter.portrait ?? null;


// ================================
// БРОСОК
// ================================

if (!window.DiceRoller) {
    new Notice("Dice Roller API не найден.");
    return;
}

const { result, roller } =
    await window.DiceRoller.parseDice(
        formula,
        file.path
    );

if (
    result === undefined ||
    result === null ||
    !roller
) {
    new Notice("Не удалось выполнить бросок.");
    return;
}


// ================================
// КРАСИВЫЙ РЕЗУЛЬТАТ
// ================================

const diceResult = roller.children[0].result;
const bonus = result - diceResult;

let details = `${roller.children[0].display}`;

if (bonus > 0) {
    details += ` + ${bonus}`;
}
else if (bonus < 0) {
    details += ` - ${Math.abs(bonus)}`;
}


// ================================
// ПОИСК ПОРТРЕТА В VAULT
// ================================

function getPortraitFile(value) {

    if (!value || typeof value !== "string") {
        return null;
    }

    // Поддерживает:
    // Портреты/Зеновия.jpg
    // [[Портреты/Зеновия.jpg]]
    // ![[Портреты/Зеновия.jpg]]
    let path = value.trim();

    path = path
        .replace(/^!\[\[/, "")
        .replace(/^\[\[/, "")
        .replace(/\]\]$/, "");

    // Если есть alias:
    // [[Зеновия.jpg|Зеновия]]
    path = path.split("|")[0].trim();


    // Сначала пробуем точный путь
    const exactFile =
        app.vault.getAbstractFileByPath(path);

    if (exactFile instanceof TFile) {
        return exactFile;
    }


    // Затем пытаемся разрешить как Obsidian-ссылку
    const linkedFile =
        app.metadataCache.getFirstLinkpathDest(
            path,
            file.path
        );

    if (linkedFile instanceof TFile) {
        return linkedFile;
    }

    return null;
}


const portraitFile =
    getPortraitFile(portraitValue);


// ================================
// EMBED
// ================================

const embed = {
    title: rollName,
    description: `🎲 ${details} = **${result}**`
};


// ================================
// БЕЗ ПОРТРЕТА
// ================================

if (!portraitFile) {

    await requestUrl({
        url: WEBHOOK_URL,
        method: "POST",
        contentType: "application/json",

        body: JSON.stringify({
            embeds: [embed]
        })
    });

    new Notice(`🎲 ${rollName}: ${result}`);
    return;
}


// ================================
// ПОРТРЕТ
// ================================

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


// Discord получит простое имя файла,
// независимо от настоящего имени изображения
const discordFileName =
    `portrait.${extension}`;


// Читаем картинку из vault
const portraitBuffer =
    await app.vault.readBinary(portraitFile);


// Thumbnail использует прикреплённый файл
embed.thumbnail = {
    url: `attachment://${discordFileName}`
};


// ================================
// DISCORD PAYLOAD
// ================================

const payload = {
    embeds: [embed],

    attachments: [
        {
            id: 0,
            filename: discordFileName
        }
    ]
};


// ================================
// MULTIPART
// ================================

const boundary =
    `----ObsidianDiscord${Date.now()}`;

const encoder = new TextEncoder();


const start = encoder.encode(

    `--${boundary}\r\n` +

    `Content-Disposition: form-data; name="payload_json"\r\n` +
    `Content-Type: application/json\r\n\r\n` +

    `${JSON.stringify(payload)}\r\n` +

    `--${boundary}\r\n` +

    `Content-Disposition: form-data; name="files[0]"; filename="${discordFileName}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
);


const image =
    new Uint8Array(portraitBuffer);


const end = encoder.encode(
    `\r\n--${boundary}--\r\n`
);


const body = new Uint8Array(
    start.length +
    image.length +
    end.length
);


body.set(start, 0);

body.set(
    image,
    start.length
);

body.set(
    end,
    start.length + image.length
);


// ================================
// ОТПРАВКА
// ================================

await requestUrl({
    url: WEBHOOK_URL,
    method: "POST",

    headers: {
        "Content-Type":
            `multipart/form-data; boundary=${boundary}`
    },

    body: body.buffer
});


new Notice(`🎲 ${rollName}: ${result}`);