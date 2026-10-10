// Кнопки короткого и длинного отдыха из "Scripts/Панель мастера.md".
// Ресурс с полями <name>, <name>_max, <name>_rest_short:
//  * флажок true -> восстанавливается после короткого И длинного отдыха;
//  * флажок false -> только после длинного.
// mana_spent — особый случай: накопленный расход сбрасывается до нуля.
// HP после длинного отдыха восстанавливаются до max_hp; после короткого
// хиты не меняются, так как персонаж должен самостоятельно тратить Кости Хитов.

const { Notice, TFile, FuzzySuggestModal, Modal } = obsidian;
const restType = context.args?.rest;
if (restType !== "short" && restType !== "long") {
    new Notice("Неизвестный тип отдыха.");
    return;
}
const isShort = restType === "short";
const label = isShort ? "Короткий отдых" : "Длинный отдых";

const characterFiles = app.vault.getMarkdownFiles()
    .filter(f => f.path.startsWith("Персонажи/"))
    .filter(f => {
        const fm = app.metadataCache.getFileCache(f)?.frontmatter;
        return fm && (fm.hp !== undefined || fm.mana_spent !== undefined ||
            Object.keys(fm).some(k => k.endsWith("_rest_short")));
    });
const testPath = "Шаблоны/тестовый персонаж.md";
const testFile = app.vault.getAbstractFileByPath(testPath);
const candidates = characterFiles.slice();
if (testFile instanceof TFile) candidates.push(testFile);
if (candidates.length === 0) {
    new Notice("Не найдено персонажей с доступными ресурсами.");
    return;
}

const choices = [
    ...(characterFiles.length > 1
        ? [{ name: "Вся группа (папка Персонажи)", files: characterFiles, group: true }]
        : []),
    ...candidates.map(f => ({
        name: app.metadataCache.getFileCache(f)?.frontmatter?.character_name ||
            (f.path === testPath ? "Тестовый персонаж (шаблон)" : f.basename),
        files: [f], group: false
    }))
];
const selected = await new Promise(resolve => {
    let picked = false;
    class PickCharacter extends FuzzySuggestModal {
        getItems() { return choices; }
        getItemText(item) { return item.name; }
        onChooseItem(item) { picked = true; resolve(item); }
        onClose() { super.onClose(); if (!picked) resolve(null); }
    }
    const picker = new PickCharacter(app);
    picker.setPlaceholder("Выбери персонажа или всю группу...");
    picker.open();
});
if (!selected) return;

if (selected.group) {
    const confirmed = await new Promise(resolve => {
        let done = false;
        class ConfirmGroupRest extends Modal {
            onOpen() {
                this.contentEl.empty();
                this.contentEl.createEl("h3", { text: label });
                this.contentEl.createEl("p", {
                    text: "Восстановить ресурсы всех персонажей группы (" +
                        selected.files.length + ")?"
                });
                const actions = this.contentEl.createDiv();
                const yes = actions.createEl("button", { text: "Восстановить" });
                yes.classList.add("mod-cta");
                yes.addEventListener("click", () => {
                    done = true;
                    this.close();
                    resolve(true);
                });
                const no = actions.createEl("button", { text: "Отмена" });
                no.addEventListener("click", () => this.close());
            }
            onClose() {
                this.contentEl.empty();
                if (!done) resolve(false);
            }
        }
        new ConfirmGroupRest(app).open();
    });
    if (!confirmed) return;
}

const enabled = value => value === true || value === "true" || value === 1;
const finite = value => value !== null && value !== undefined && value !== "" &&
    Number.isFinite(Number(value)) && Number(value) >= 0;
const report = [];
const errors = [];
for (const character of selected.files) {
    try {
        const recovered = [];
        await app.fileManager.processFrontMatter(character, fm => {
            // На длинном отдыхе хиты восстанавливаются полностью.
            if (!isShort && finite(fm.max_hp) && fm.hp !== undefined &&
                Number(fm.hp) !== Number(fm.max_hp)) {
                fm.hp = Number(fm.max_hp);
                recovered.push("HP");
            }
            for (const flag of Object.keys(fm).filter(k => k.endsWith("_rest_short"))) {
                if (isShort && !enabled(fm[flag])) continue;
                const field = flag.slice(0, -"_rest_short".length);
                if (field === "mana_spent") {
                    if (fm.mana_spent !== undefined && Number(fm.mana_spent) !== 0) {
                        fm.mana_spent = 0;
                        recovered.push("мана");
                    }
                    continue;
                }
                const maxField = field + "_max";
                if (fm[field] === undefined || !finite(fm[maxField])) continue;
                const max = Number(fm[maxField]);
                if (Number(fm[field]) !== max) {
                    fm[field] = max;
                    recovered.push(field);
                }
            }
            // Старые листы с маной, но без флажка: по умолчанию длинный отдых.
            if (!isShort && fm.mana_spent !== undefined &&
                !Object.prototype.hasOwnProperty.call(fm, "mana_spent_rest_short") &&
                Number(fm.mana_spent) !== 0) {
                fm.mana_spent = 0;
                recovered.push("мана");
            }
        });
        if (recovered.length) report.push(character.basename + ": " + recovered.join(", "));
    } catch (error) {
        errors.push(character.basename + ": " + (error?.message || String(error)));
    }
}
if (report.length) new Notice(label + " — восстановлено:\n" + report.join("\n"), 11000);
else if (!errors.length) new Notice(label + ": все подходящие ресурсы уже восстановлены.");
if (errors.length) new Notice("Не удалось обновить:\n" + errors.join("\n"), 11000);
