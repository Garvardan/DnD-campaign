// JS Engine + Meta Bind: обычные и временные HP персонажа.
const { Notice } = obsidian;
const action = context.args?.action;
if (!["damage", "heal", "temp"].includes(action)) {
    new Notice("Неизвестное действие с HP.");
    return;
}
const file = app.workspace.getActiveFile();
if (!file || !(file.path.startsWith("Персонажи/") ||
    file.path === "Шаблоны/тестовый персонаж.md")) {
    new Notice("Открой лист персонажа, чтобы изменить HP.");
    return;
}
const amountKey = action === "damage" ? "hp_damage" :
    action === "heal" ? "hp_healing" : "temp_hp_gain";
try {
    let message = "";
    await app.fileManager.processFrontMatter(file, fm => {
        const raw = fm[amountKey];
        const amount = Number(raw);
        if (raw === undefined || raw === null || raw === "" ||
            !Number.isSafeInteger(amount) || amount <= 0) {
            throw new Error("Укажи положительное целое число для " +
                (action === "damage" ? "урона." :
                 action === "heal" ? "лечения." : "новых временных HP."));
        }

        const rawTemp = fm.temp_hp ?? 0;
        const temp = Number(rawTemp);
        if (!Number.isSafeInteger(temp) || temp < 0) {
            throw new Error("Текущие временные HP должны быть неотрицательным целым числом.");
        }

        if (action === "temp") {
            // По правилам 5e временные HP не складываются. Оставляем большее значение.
            const nextTemp = Math.max(temp, amount);
            fm.temp_hp = nextTemp;
            message = nextTemp === temp
                ? "Временные HP не изменились (" + temp + "): новые " + amount +
                  " не превосходят текущие."
                : "Временные HP: " + temp + " → " + nextTemp + ".";
        } else {
            const original = fm.hp;
            const hp = Number(original);
            if (original === undefined || original === null || original === "" ||
                !Number.isFinite(hp) || hp < 0) {
                throw new Error("Сначала укажи текущее HP персонажа.");
            }

            if (action === "damage") {
                const absorbed = Math.min(amount, temp);
                const remaining = amount - absorbed;
                const nextTemp = temp - absorbed;
                const nextHp = Math.max(0, hp - remaining);
                fm.temp_hp = nextTemp;
                fm.hp = nextHp;
                message = "Урон " + amount + ": временные HP " + temp + " → " +
                    nextTemp + ", обычные HP " + hp + " → " + nextHp + ".";
            } else {
                const rawMax = fm.max_hp;
                const max = Number(rawMax);
                if (rawMax === undefined || rawMax === null || rawMax === "" ||
                    !Number.isFinite(max) || max < 0) {
                    throw new Error("Сначала укажи максимальное HP персонажа.");
                }
                const nextHp = Math.min(max, hp + amount);
                fm.hp = nextHp;
                message = "Лечение " + amount + ": HP " + hp + " → " + nextHp +
                    ". Временные HP: " + temp + ".";
            }
        }
        fm[amountKey] = 0;
    });
    new Notice(message);
} catch (error) {
    new Notice(error?.message ?? String(error));
}
