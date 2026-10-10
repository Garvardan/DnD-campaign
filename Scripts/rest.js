// JS Engine: кнопки отдыха изменяют только текущий лист персонажа.
const { Notice } = obsidian;
const rest = context.args?.rest;
if (rest !== "short" && rest !== "long") {
    new Notice("Неизвестный тип отдыха");
    return;
}
const file = app.workspace.getActiveFile();
if (!file || !(file.path.startsWith("Персонажи/") ||
    file.path === "Шаблоны/тестовый персонаж.md")) {
    new Notice("Открой лист персонажа, чтобы восстановить ресурсы.");
    return;
}
const isShort = rest === "short";
const updated = [];
const valid = v => v !== null && v !== undefined && v !== "" &&
    Number.isFinite(Number(v)) && Number(v) >= 0;
const marked = v => v === true || v === "true" || v === 1;
try {
    await app.fileManager.processFrontMatter(file, fm => {
        // Короткий отдых не лечит автоматически и не тратит Кости Хитов.
        if (!isShort) {
            if (valid(fm.max_hp) && fm.hp !== undefined && Number(fm.hp) !== Number(fm.max_hp)) {
                fm.hp = Number(fm.max_hp);
                updated.push("HP");
            }
            // Длинный отдых возвращает до половины общего числа
            // Костей Хитов персонажа (минимум 1) по D&D 5e 2014.
            if (valid(fm.lvl) && fm.hit_dice !== undefined) {
                const max = Math.max(0, Math.floor(Number(fm.lvl)));
                const current = valid(fm.hit_dice) ? Math.max(0, Math.floor(Number(fm.hit_dice))) : 0;
                const regained = max ? Math.max(1, Math.floor(max / 2)) : 0;
                const next = Math.min(max, current + regained);
                if (next !== Number(fm.hit_dice)) {
                    fm.hit_dice = next;
                    updated.push("Кости Хитов");
                }
            }
        }
        // Ресурс: <имя>, <имя>_max, <имя>_rest_short.
        // Флажок true: короткий и длинный отдых; false: только длинный.
        for (const flag of Object.keys(fm).filter(k => k.endsWith("_rest_short"))) {
            if (isShort && !marked(fm[flag])) continue;
            const key = flag.slice(0, -"_rest_short".length);
            if (key === "mana_spent") {
                if (fm.mana_spent !== undefined && Number(fm.mana_spent) !== 0) {
                    fm.mana_spent = 0;
                    updated.push("мана");
                }
                continue;
            }
            const maxKey = key + "_max";
            if (fm[key] === undefined || !valid(fm[maxKey])) continue;
            if (Number(fm[key]) !== Number(fm[maxKey])) {
                fm[key] = Number(fm[maxKey]);
                updated.push(key);
            }
        }
        // Старые листы, где ещё нет mana_spent_rest_short.
        if (!isShort && fm.mana_spent !== undefined && Number(fm.mana_spent) !== 0) {
            fm.mana_spent = 0;
            if (!updated.includes("мана")) updated.push("мана");
        }
    });
    const label = isShort ? "Короткий отдых" : "Длинный отдых";
    new Notice(updated.length ? label + " (" + file.basename + "): " + updated.join(", ") :
        label + ": все ресурсы уже восстановлены.");
} catch (error) {
    new Notice("Ошибка восстановления: " + (error?.message ?? String(error)));
}
