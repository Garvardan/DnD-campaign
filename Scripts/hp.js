// JS Engine + Meta Bind: применение урона или лечения к текущему листу персонажа.
const { Notice } = obsidian;
const action = context.args?.action;
if (!["damage", "heal"].includes(action)) {
    new Notice("Неизвестное действие с HP.");
    return;
}
const file = app.workspace.getActiveFile();
if (!file || !(file.path.startsWith("Персонажи/") ||
    file.path === "Шаблоны/тестовый персонаж.md")) {
    new Notice("Открой лист персонажа, чтобы изменить HP.");
    return;
}
const amountKey = action === "damage" ? "hp_damage" : "hp_healing";
try {
    let message = "";
    await app.fileManager.processFrontMatter(file, fm => {
        const raw = fm[amountKey];
        const amount = Number(raw);
        if (raw === undefined || raw === null || raw === "" ||
            !Number.isSafeInteger(amount) || amount <= 0) {
            throw new Error(action === "damage" ?
                "Укажи положительное целое число урона." :
                "Укажи положительное целое число лечения.");
        }
        const original = fm.hp;
        const hp = Number(original);
        if (original === undefined || original === null || original === "" ||
            !Number.isFinite(hp) || hp < 0) {
            throw new Error("Сначала укажи текущее HP персонажа.");
        }
        let updated;
        if (action === "damage") {
            updated = Math.max(0, hp - amount);
        } else {
            const rawMax = fm.max_hp;
            const max = Number(rawMax);
            if (rawMax === undefined || rawMax === null || rawMax === "" ||
                !Number.isFinite(max) || max < 0) {
                throw new Error("Сначала укажи максимальное HP персонажа.");
            }
            updated = Math.min(max, hp + amount);
        }
        fm.hp = updated;
        fm[amountKey] = 0;
        message = (action === "damage" ? "Урон: " : "Лечение: ") +
            amount + ". HP: " + hp + " → " + updated + ".";
    });
    new Notice(message);
} catch (error) {
    new Notice(error?.message ?? String(error));
}
