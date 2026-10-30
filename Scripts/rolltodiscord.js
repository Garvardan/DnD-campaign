const { requestUrl, Notice, TFile } = obsidian;

// ================================
// НАСТРОЙКИ
// ================================
// ================================
// WEBHOOKS
// ================================

const WEBHOOK_PUBLIC =
    "https://discord.com/api/webhooks/1550124206769836034/AB7QcM3sSUiU6wgGPAyhuF9m6dIFGqjgVY-6MsxIRbQnF6km4QXXb-alFUQCXHC_2PCw";

const WEBHOOK_PRIVATE =
    "https://discord.com/api/webhooks/1553383742683226124/Jkje5QoP4U-ebzfBzU9UWJdsZ3pQ8ZBTAaRbsSS7fP93XbH-BMEydKFcuRR_HJcqHxTv";

// ================================
// ФОРМУЛА
// ================================

// Meta Bind передаёт модификаторы клика через context.click.
// Только кнопки броска атаки помечаются attackRoll: true.
// Shift — преимущество, Alt — помеха; вместе взаимно отменяются.
const isAttackRoll = context.args?.attackRoll === true;
const shift = context.click?.shiftKey === true;
const alt = context.click?.altKey === true;
const rollMode = isAttackRoll && shift !== alt
    ? (shift ? "advantage" : "disadvantage")
    : "normal";
const baseFormula = String(context.args?.formula ?? "1d20");
const hasAttackD20 = /\b1d20\b/i.test(baseFormula);
let rawFormula = hasAttackD20 && rollMode !== "normal"
    ? baseFormula.replace(/\b1d20\b/i, rollMode === "advantage" ? "2d20kh1" : "2d20kl1")
    : baseFormula;
const baseRollName = String(context.args?.name ?? "Бросок");
const rollName = baseRollName +
    (hasAttackD20 && rollMode === "advantage" ? " (с преимуществом)" :
     hasAttackD20 && rollMode === "disadvantage" ? " (с помехой)" : "");


// ================================
// ДАННЫЕ ПЕРСОНАЖА
// ================================

const file =
    app.workspace.getActiveFile();

if (!file) {
    new Notice("Активный файл не найден.");
    return;
}

const frontmatter =
    app.metadataCache
        .getFileCache(file)
        ?.frontmatter ?? {};

// ================================
// ДОПОЛНИТЕЛЬНЫЕ БОНУСЫ К ПРОВЕРКАМ
// Ctrl + кнопка проверки / спасброска / инициативы: редактировать.
// Обычный клик: бросить кубик с сохранёнными бонусами.
// Хранятся в character_roll_bonuses внутри YAML данного персонажа.
// Атаки и урон этот обработчик не затрагивает.
// ================================

const rollBonusKey = baseRollName.trim();
const canConfigureBonuses = !isAttackRoll &&
    /^(?:Проверка|Спасбросок)(?:\s|$)/u.test(rollBonusKey);
const bonusConfig = frontmatter.character_roll_bonuses;
const bonusMap = bonusConfig && typeof bonusConfig === "object" &&
    !Array.isArray(bonusConfig) ? bonusConfig : {};

function parseBonusAmount(value) {
    const normalized = String(value ?? "").trim().replace(",", ".");
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
    const number = Number(normalized);
    return Number.isFinite(number) && Math.abs(number) <= 100000 ? number : null;
}

function readableBonus(number) {
    return (number >= 0 ? "+" : "") + String(number);
}

const storedRollBonuses = canConfigureBonuses && Array.isArray(bonusMap[rollBonusKey])
    ? bonusMap[rollBonusKey] : [];

if (canConfigureBonuses && context.click?.ctrlKey === true) {
    const { Modal, Setting } = obsidian;

    class RollBonusesModal extends Modal {
        constructor() {
            super(app);
            this.entries = storedRollBonuses
                .filter(item => item && typeof item === "object")
                .map(item => ({
                    source: String(item.source ?? item.name ?? ""),
                    amount: String(item.value ?? item.bonus ?? ""),
                    enabled: item.enabled !== false
                }));
        }

        onOpen() {
            this.titleEl.setText("Бонусы: " + rollBonusKey);
            this.modalEl.style.width = "min(680px, 96vw)";
            this.contentEl.createEl("p", {
                text: "Добавляй источники бонусов, например «Бдительный» +5 к инициативе. " +
                      "Они сохраняются только для этой проверки у этого персонажа. " +
                      "Отключённые бонусы не влияют на броски."
            });

            const list = this.contentEl.createDiv({ cls: "character-roll-bonus-list" });
            const summary = this.contentEl.createEl("p");
            summary.style.fontWeight = "600";

            const updateSummary = () => {
                let total = 0;
                for (const entry of this.entries) {
                    if (!entry.enabled || (!entry.source.trim() && !entry.amount.trim())) continue;
                    const value = parseBonusAmount(entry.amount);
                    if (value === null) {
                        summary.setText("Сумма: проверь значения бонусов");
                        return;
                    }
                    total += value;
                }
                summary.setText("Сумма активных бонусов: " +
                    readableBonus(Number(total.toFixed(6))));
            };

            const addEntry = entry => {
                this.entries.push(entry);
                const row = list.createDiv({ cls: "character-roll-bonus-entry" });
                row.style.display = "flex";
                row.style.flexWrap = "wrap";
                row.style.alignItems = "center";
                row.style.gap = "8px";
                row.style.padding = "8px 0";
                row.style.borderBottom = "1px solid var(--background-modifier-border)";

                const source = row.createEl("input", {
                    type: "text",
                    attr: { placeholder: "Источник: Бдительный", "aria-label": "Источник бонуса" }
                });
                source.style.flex = "1 1 185px";
                source.style.minWidth = "120px";
                source.value = entry.source;
                source.addEventListener("input", () => {
                    entry.source = source.value;
                    updateSummary();
                });

                const amount = row.createEl("input", {
                    type: "text",
                    attr: { placeholder: "+5", "aria-label": "Числовой бонус" }
                });
                amount.style.flex = "0 0 78px";
                amount.style.width = "78px";
                amount.value = entry.amount;
                amount.addEventListener("input", () => {
                    entry.amount = amount.value;
                    updateSummary();
                });

                const active = row.createEl("label");
                active.style.display = "inline-flex";
                active.style.alignItems = "center";
                active.style.gap = "5px";
                const checkbox = active.createEl("input", { type: "checkbox" });
                checkbox.checked = entry.enabled;
                active.createSpan({ text: "Активен" });
                checkbox.addEventListener("change", () => {
                    entry.enabled = checkbox.checked;
                    updateSummary();
                });

                const remove = row.createEl("button", { text: "✕" });
                remove.setAttribute("aria-label", "Удалить бонус");
                remove.title = "Удалить этот бонус";
                remove.addEventListener("click", () => {
                    this.entries = this.entries.filter(item => item !== entry);
                    row.remove();
                    updateSummary();
                });
                updateSummary();
            };

            const initial = this.entries.slice();
            this.entries = [];
            if (initial.length) initial.forEach(addEntry);
            else addEntry({ source: "", amount: "", enabled: true });

            new Setting(this.contentEl)
                .addButton(button => button
                    .setButtonText("+ Добавить источник")
                    .onClick(() => addEntry({ source: "", amount: "", enabled: true })));

            new Setting(this.contentEl)
                .addButton(button => button
                    .setButtonText("Сохранить")
                    .setCta()
                    .onClick(async () => {
                        const saved = [];
                        for (const entry of this.entries) {
                            const name = entry.source.trim();
                            const text = entry.amount.trim();
                            if (!name && !text) continue;
                            const value = parseBonusAmount(text);
                            if (!name || name.length > 100 || value === null) {
                                new Notice("Укажи название (до 100 символов) и числовой бонус, например +5 или -2.");
                                return;
                            }
                            saved.push({ source: name, value, enabled: entry.enabled });
                        }
                        button.setDisabled(true);
                        try {
                            await app.fileManager.processFrontMatter(file, fm => {
                                const current = fm.character_roll_bonuses;
                                const updated = current && typeof current === "object" &&
                                    !Array.isArray(current) ? { ...current } : {};
                                if (saved.length) updated[rollBonusKey] = saved;
                                else delete updated[rollBonusKey];
                                if (Object.keys(updated).length) fm.character_roll_bonuses = updated;
                                else delete fm.character_roll_bonuses;
                            });
                            this.close();
                            new Notice("Бонусы к «" + rollBonusKey + "» сохранены.");
                        } catch (error) {
                            button.setDisabled(false);
                            new Notice("Не удалось сохранить бонусы: " +
                                String(error?.message ?? error));
                        }
                    }))
                .addButton(button => button
                    .setButtonText("Отмена")
                    .onClick(() => this.close()));

            updateSummary();
        }

        onClose() {
            this.contentEl.empty();
        }
    }

    new RollBonusesModal().open();
    return; // Ctrl+клик только открывает окно, без броска и отправки в Discord.
}

const activeRollBonuses = canConfigureBonuses
    ? storedRollBonuses
        .map(item => ({
            source: String(item?.source ?? item?.name ?? "").trim(),
            value: parseBonusAmount(item?.value ?? item?.bonus),
            enabled: item?.enabled !== false
        }))
        .filter(item => item.enabled && item.source && item.value !== null)
    : [];

const bonusTotal = Number(activeRollBonuses
    .reduce((sum, item) => sum + item.value, 0).toFixed(6));

if (bonusTotal > 0) rawFormula += " + " + bonusTotal;
else if (bonusTotal < 0) rawFormula += " - " + Math.abs(bonusTotal);

// Отдельно показываем источники; итоговое число уже содержит бонусы.
const bonusDescription = activeRollBonuses.length
    ? "\nДоп. бонусы: " + activeRollBonuses.map(item =>
        item.source.replace(/[\r\n\x60*_@]/g, " ").slice(0, 100) +
        " " + readableBonus(item.value)).join(" · ").slice(0, 700)
    : "";

// ================================
// ВЫБОР КАНАЛА
// ================================

const privateRoll =
    frontmatter.private_roll === true ||
    frontmatter.private_roll === "true";

const WEBHOOK_URL =
    privateRoll
        ? WEBHOOK_PRIVATE
        : WEBHOOK_PUBLIC;

new Notice(
    privateRoll
        ? "🔒 Бросок в личный канал"
        : "🌐 Бросок в общий канал"
);

// ================================
// ПОДСТАНОВКА [СВОЙСТВ]
// ================================

// Например:
//
// 2d[prof]
//
// при prof: 6
//
// станет:
//
// 2d6

// Удобная запись количества и граней через свойства:
// halfprofDstr_mod -> [halfprof]d[str_mod].
// Обычные 4d6, 1d20 и другие формулы остаются без изменений.
const normalizedFormula = String(rawFormula).replace(
    /\b([A-Za-z_][A-Za-z0-9_]*?)D([A-Za-z_][A-Za-z0-9_]*)\b/g,
    (_, count, sides) => "[" + count + "]d[" + sides + "]"
);

const formula =
    normalizedFormula.replace(
        /\[([A-Za-z_][A-Za-z0-9_]*)\]/g,
        (_, property) => {

            const value =
                frontmatter[property];

            if (
                value === undefined ||
                value === null ||
                isNaN(Number(value))
            ) {
                throw new Error(
                    `Не найдено числовое свойство: ${property}`
                );
            }

            return String(value);
        }
    );


// ================================
// ДАННЫЕ ПЕРСОНАЖА
// ================================

const characterName =
    frontmatter.character_name ?? file.basename;

const portraitValue =
    frontmatter.portrait ?? null;

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

// Получаем отображение ВСЕХ кубов
let details = roller.getDisplayText();


// Объединяем все числовые модификаторы броска в одно число.
// Значения кубиков и итог result сохраняются: для вывода вычитаем
// сумму фактически выпавших кубиков из результата броска.
function combineRollModifiers(displayText, rollResult) {
    const original = String(displayText ?? "");
    const total = Number(rollResult);
    if (!Number.isFinite(total)) return original;

    // Обычный вывод Dice Roller: [7], [3, 5], [7] + [4].
    const dicePattern = /\[\s*\d+d?(?:\s*[,;]\s*\d+d?)*\s*\]/g;
    const matches = [...original.matchAll(dicePattern)];
    if (!matches.length) return original;

    // Для нестандартных кубиков и выражений с группировками
    // сохраняем оригинальный вывод, чтобы не менять смысл броска.
    const masked = original.replace(dicePattern, "D");
    if (!/^[\s\d.D+\-*/]*$/.test(masked)) return original;

    let diceTotal = 0;
    let cursor = 0;
    const rolls = [];
    for (const [index, match] of matches.entries()) {
        const between = original.slice(cursor, match.index).trim();
        // Кубики должны быть отдельными слагаемыми, а не
        // множителями или делителями.
        if (index === 0) {
            if (between && !/[+-]$/.test(between)) return original;
        } else {
            if (!between || !/^[+-]/.test(between) || !/[+-]$/.test(between)) {
                return original;
            }
        }
        const sign = between.endsWith("-") ? -1 : 1;
        // "d" в отображении Dice Roller обозначает отброшенный кубик.
        // Оставляем его видимым, но исключаем из суммы для модификатора.
        const values = match[0].slice(1, -1)
            .split(/\s*[,;]\s*/)
            .filter(value => !/d$/i.test(value))
            .map(Number);
        if (values.some(value => !Number.isFinite(value))) return original;

        diceTotal += sign * values.reduce((sum, value) => sum + value, 0);
        rolls.push({ sign, text: match[0] });
        cursor = match.index + match[0].length;
    }
    const tail = original.slice(cursor).trim();
    if (tail && !/^[+-]/.test(tail)) return original;

    const bonus = Number((total - diceTotal).toFixed(8));
    let compact = rolls.map((roll, index) => {
        if (index === 0) return roll.sign < 0 ? "- " + roll.text : roll.text;
        return (roll.sign < 0 ? " - " : " + ") + roll.text;
    }).join("");

    if (bonus > 0) compact += " + " + bonus;
    if (bonus < 0) compact += " - " + Math.abs(bonus);
    return compact;
}

details = combineRollModifiers(details, result);

// ================================
// ПОИСК ПОРТРЕТА
// ================================

function getPortraitFile(value) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return null;
    }


    let path =
        value.trim();


    // Поддерживает:
    //
    // Портреты/Зеновия.jpg
    // [[Портреты/Зеновия.jpg]]
    // ![[Портреты/Зеновия.jpg]]

    path = path
        .replace(/^!\[\[/, "")
        .replace(/^\[\[/, "")
        .replace(/\]\]$/, "");


    // [[Портреты/Зеновия.jpg|Зеновия]]

    path =
        path.split("|")[0].trim();


    // Сначала точный путь

    const exactFile =
        app.vault.getAbstractFileByPath(path);


    if (exactFile instanceof TFile) {
        return exactFile;
    }


    // Потом Obsidian-ссылка

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

    title: characterName,

    description:
        `**${rollName}**\n\n` +
        `${details} = **${result}**${bonusDescription}`
};


// ================================
// ЕСЛИ ПОРТРЕТА НЕТ
// ================================

if (!portraitFile) {

    await requestUrl({

        url: WEBHOOK_URL,

        method: "POST",

        contentType:
            "application/json",

        body: JSON.stringify({
            embeds: [embed]
        })
    });


    new Notice(
        `🎲 ${rollName}: ${result}`
    );

    return;
}


// ================================
// ПОДГОТОВКА ПОРТРЕТА
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
    mimeTypes[extension]
    ?? "application/octet-stream";


const discordFileName =
    `portrait.${extension}`;


// Читаем картинку из vault

const portraitBuffer =
    await app.vault.readBinary(
        portraitFile
    );


// Discord thumbnail

embed.thumbnail = {
    url:
        `attachment://${discordFileName}`
};


// ================================
// PAYLOAD
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


const encoder =
    new TextEncoder();


const start =
    encoder.encode(

        `--${boundary}\r\n` +

        `Content-Disposition: form-data; name="payload_json"\r\n` +

        `Content-Type: application/json\r\n\r\n` +

        `${JSON.stringify(payload)}\r\n` +

        `--${boundary}\r\n` +

        `Content-Disposition: form-data; name="files[0]"; filename="${discordFileName}"\r\n` +

        `Content-Type: ${mimeType}\r\n\r\n`
    );


const image =
    new Uint8Array(
        portraitBuffer
    );


const end =
    encoder.encode(
        `\r\n--${boundary}--\r\n`
    );


const body =
    new Uint8Array(

        start.length +

        image.length +

        end.length
    );


body.set(
    start,
    0
);


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

    body:
        body.buffer
});


new Notice(
    `🎲 ${rollName}: ${result}`
);