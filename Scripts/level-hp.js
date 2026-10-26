// JS Engine: добавление результата броска Кости Хитов и прочих бонусов
// в базовый запас HP. Модификатор Телосложения учитывается автоматически
// в листе: max_hp = max(0, hp_base + floor((con - 10)/2) * lvl).
(async () => {
    const { Notice } = obsidian;
    const file = app.workspace.getActiveFile();
    if (!file || file.extension !== "md" ||
        !(file.path.startsWith("Персонажи/") ||
          file.path === "Шаблоны/тестовый персонаж.md")) {
        new Notice("Открой лист персонажа.");
        return;
    }
    try {
        let message = "";
        await app.fileManager.processFrontMatter(file, fm => {
            const amount = Number(fm.hp_gain);
            if (fm.hp_gain === null || fm.hp_gain === undefined || fm.hp_gain === "" ||
                !Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 100000) {
                throw new Error("Укажи ненулевой целый прирост HP (без модификатора Телосложения).");
            }
            const base = Number(fm.hp_base);
            if (!Number.isSafeInteger(base) || base < 0) {
                throw new Error("Некорректное накопленное HP. Проверь hp_base в свойствах.");
            }
            const level = Number(fm.lvl);
            if (!Number.isSafeInteger(level) || level < 0 || level > 100) {
                throw new Error("Укажи корректный уровень персонажа (0–100).");
            }
            const constitution = Number(fm.con);
            if (!Number.isSafeInteger(constitution) || constitution < 1 || constitution > 100) {
                throw new Error("Укажи Телосложение персонажа, чтобы рассчитать MAX HP.");
            }

            const nextBase = base + amount;
            if (!Number.isSafeInteger(nextBase) || nextBase < 0 || nextBase > 1000000) {
                throw new Error("Прирост выходит за допустимые границы базовых HP.");
            }
            const modifier = Math.floor((constitution - 10) / 2);
            const maximum = Math.max(0, nextBase + modifier * level);
            fm.hp_base = nextBase;
            fm.max_hp = maximum;
            fm.hp_gain = 0; // защита от повторного начисления тем же числом
            message = "Прирост HP " + (amount > 0 ? "+" : "") + amount +
                ". Основа: " + base + " → " + nextBase +
                ". Модификатор ТЕЛ: " + (modifier >= 0 ? "+" : "") +
                modifier + " × " + level +
                ". MAX HP: " + maximum + ". Текущие HP не менялись.";
        });
        new Notice(message);
    } catch (error) {
        new Notice("Ошибка прироста HP: " + (error?.message ?? String(error)));
    }
})();
