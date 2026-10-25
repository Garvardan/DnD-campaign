// JS Engine + Meta Bind: список известных вариантов метамагии Риас.
const { Notice, FuzzySuggestModal } = obsidian;
const action = context.args?.action;
const file = app.workspace.getActiveFile();
if (!file || file.path !== "Персонажи/Риас.md") {
    new Notice("Открой лист Риас, чтобы изменить метамагию.");
    return;
}
if (!["add", "remove"].includes(action)) {
    new Notice("Неизвестное действие метамагии.");
    return;
}
const catalog = [
    { name: "Аккуратное заклинание", cost: "1 очко" },
    { name: "Далёкое заклинание", cost: "1 очко" },
    { name: "Непреодолимое заклинание", cost: "3 очка" },
    { name: "Неуловимое заклинание", cost: "1 очко" },
    { name: "Продлённое заклинание", cost: "1 очко" },
    { name: "Удвоенное заклинание", cost: "уровень заклинания, минимум 1" },
    { name: "Усиленное заклинание", cost: "1 очко" },
    { name: "Ускоренное заклинание", cost: "2 очка" },
    { name: "Ищущее заклинание", cost: "2 очка · Таша" },
    { name: "Преобразованное заклинание", cost: "1 очко · Таша" }
];
const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
const selected = new Set(Array.isArray(frontmatter.character_metamagic)
    ? frontmatter.character_metamagic.map(x => String(x)) : []);
const items = catalog.filter(x => action === "add" ? !selected.has(x.name) : selected.has(x.name))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
if (!items.length) {
    new Notice(action === "add" ? "Все варианты метамагии уже добавлены." : "Список метамагии пуст.");
    return;
}
class MetamagicPicker extends FuzzySuggestModal {
    getItems() { return items; }
    getItemText(item) { return item.name + " — " + item.cost; }
    onChooseItem(item) {
        app.fileManager.processFrontMatter(file, fm => {
            const known = Array.isArray(fm.character_metamagic)
                ? fm.character_metamagic.map(x => String(x)) : [];
            fm.character_metamagic = action === "add"
                ? [...new Set([...known, item.name])]
                : known.filter(name => name !== item.name);
        }).then(() => {
            new Notice((action === "add" ? "Метамагия добавлена: " : "Метамагия удалена: ") + item.name);
        }).catch(error => new Notice("Ошибка метамагии: " + (error?.message ?? String(error))));
    }
}
const picker = new MetamagicPicker(app);
picker.setPlaceholder(action === "add" ? "Найди вариант метамагии..." : "Какую метамагию убрать?");
picker.open();
