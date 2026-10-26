// JS Engine + Meta Bind: добавление/удаление заклинаний в текущем листе.
// Каталог: Заклинания/{Заговоры,1 круг,...,9 круг}/<название>.md
const { Notice, FuzzySuggestModal } = obsidian;
const action = context.args?.action;
const file = app.workspace.getActiveFile();
if (!file || !["Шаблоны/тестовый персонаж.md", "Персонажи/Риас.md"].includes(file.path)) {
    new Notice("Открой лист Риас или тестового персонажа.");
    return;
}
if (!["add", "remove"].includes(action)) {
    new Notice("Неизвестное действие гримуара.");
    return;
}
const current = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
const addedPaths = [...new Set(Array.isArray(current.character_spells) ?
    current.character_spells.map(x => String(x)) : [])];
const spellFiles = app.vault.getMarkdownFiles()
    .filter(f => f.path.startsWith("Заклинания/") && f.basename !== "00 Индекс")
    .map(f => {
        const fm = app.metadataCache.getFileCache(f)?.frontmatter;
        if (!fm || !Number.isInteger(Number(fm.spell_level)) ||
            Number(fm.spell_level) < 0 || Number(fm.spell_level) > 9) return null;
        return {
            file: f, path: f.path, level: Number(fm.spell_level),
            classes: Array.isArray(fm.spell_classes) ? fm.spell_classes : []
        };
    }).filter(Boolean);
const selectedClass = String(current.character_class ?? "");
const filterClass = selectedClass && selectedClass !== "Нет";
const items = action === "add" ?
    spellFiles.filter(s => !addedPaths.includes(s.path)) :
    spellFiles.filter(s => addedPaths.includes(s.path));
items.sort((a, b) => {
    const aMatch = !filterClass || a.classes.includes(selectedClass) ? 0 : 1;
    const bMatch = !filterClass || b.classes.includes(selectedClass) ? 0 : 1;
    // Для добавления вначале показываем заклинания выбранного класса.
    if (action === "add" && aMatch !== bMatch) return aMatch - bMatch;
    return a.level - b.level || a.file.basename.localeCompare(b.file.basename, "ru");
});
if (!items.length) {
    new Notice(action === "add" ? "Нет новых заклинаний в каталоге." :
        "Список заклинаний персонажа пуст.");
    return;
}
class SpellPicker extends FuzzySuggestModal {
    getItems() { return items; }
    getItemText(s) {
        const label = s.level === 0 ? "Заговор" : s.level + " круг";
        const note = filterClass && !s.classes.includes(selectedClass) ?
            " · другой класс" : "";
        return label + " — " + s.file.basename + note;
    }
    onChooseItem(spell) {
        app.fileManager.processFrontMatter(file, fm => {
            const existing = Array.isArray(fm.character_spells) ?
                fm.character_spells.map(x => String(x)) : [];
            fm.character_spells = action === "add" ?
                [...new Set([...existing, spell.path])] :
                existing.filter(p => p !== spell.path);
            if (action === "remove") fm.character_spell_extra = (Array.isArray(fm.character_spell_extra) ? fm.character_spell_extra : []).filter(x => String(x?.path ?? "") !== spell.path);
        }).then(() => {
            new Notice((action === "add" ? "Добавлено: " : "Убрано: ") +
                spell.file.basename);
        }).catch(err => new Notice("Ошибка гримуара: " +
            (err?.message ?? String(err))));
    }
}
const picker = new SpellPicker(app);
picker.setPlaceholder(action === "add" ?
    "Найди заклинание из каталога PH14..." : "Какое заклинание убрать?");
picker.open();
