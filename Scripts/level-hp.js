// Прирост максимальных и текущих HP при повышении уровня.
// Работает со всеми листами персонажей, не перезаписывает уже имеющиеся бонусы HP.
(async () => {
    const { Notice } = obsidian;
    const file = app.workspace.getActiveFile();
    const isCharacter = file && file.extension === "md" &&
        (file.path.startsWith("Персонажи/") ||
            file.path === "Шаблоны/тестовый персонаж.md");

    if (!isCharacter) {
        new Notice("Открой лист персонажа.");
        return;
    }

    try {
        let message = "";
        await app.fileManager.processFrontMatter(file, fm => {
            const integer = (value, label, min, max) => {
                if (value === "" || value === null || value === undefined) {
                    throw new Error("Заполни поле: " + label + ".");
                }
                const number = Number(value);
                if (!Number.isSafeInteger(number) || number < min || number > max) {
                    throw new Error(label + " должен быть целым числом от " + min + " до " + max + ".");
                }
                return number;
            };

            const level = integer(fm.lvl, "Уровень персонажа", 1, 100);
            const already = integer(fm.hp_applied_level, "Уже учтённый уровень HP", 0, 100);
            const perLevel = integer(fm.hp_per_level, "HP за уровень", 1, 1000);
            const maximum = integer(fm.max_hp, "Максимальные HP", 0, 1000000);
            const current = fm.hp === "" || fm.hp === undefined || fm.hp === null
                ? null : integer(fm.hp, "Текущие HP", 0, 1000000);

            if (already > level) {
                throw new Error("Уже учтённый уровень HP больше текущего уровня. Исправь значение вручную.");
            }
            if (already === level) {
                message = "HP за " + level + "-й уровень уже учтены. Ничего не изменено.";
                return;
            }

            const gainedLevels = level - already;
            const gained = gainedLevels * perLevel;
            const nextMaximum = maximum + gained;
            if (!Number.isSafeInteger(nextMaximum) || nextMaximum > 1000000) {
                throw new Error("Получилось слишком большое значение максимальных HP.");
            }
            fm.max_hp = nextMaximum;
            if (current !== null) {
                fm.hp = Math.min(nextMaximum, current + gained);
            }
            fm.hp_applied_level = level;

            message = "HP за " + gainedLevels + " ур.: +" + gained +
                ". MAX HP: " + maximum + " → " + nextMaximum +
                (current === null ? " (текущие HP не заполнены)." :
                    ". Текущие HP: " + current + " → " + fm.hp + ".");
        });
        new Notice(message);
    } catch (error) {
        new Notice("Ошибка повышения HP: " + (error?.message ?? String(error)));
    }
})();
