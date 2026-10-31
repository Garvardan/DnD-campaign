// Создание/редактирование атак и генерация кнопок Meta Bind.
const { Notice, Modal, Setting, FuzzySuggestModal } = obsidian;
const action = context.args?.action;
const file = app.workspace.getActiveFile();
const START = "<!-- character-attacks-start -->";
const END = "<!-- character-attacks-end -->";
if (!file || !(file.path.startsWith("Персонажи/") ||
    file.path === "Шаблоны/тестовый персонаж.md")) {
    new Notice("Открой лист персонажа.");
    return;
}
if (!["add", "edit", "remove", "refresh"].includes(action)) {
    new Notice("Неизвестное действие с атаками.");
    return;
}
const clean = s => String(s ?? "").replace(/[\r\n]/g, " ").trim();
const load = fm => (Array.isArray(fm.character_attacks) ? fm.character_attacks : [])
    .filter(a => a && typeof a === "object" && a.id)
    .map(a => ({
        id: clean(a.id),
        name: clean(a.name),
        attack_bonus: clean(a.attack_bonus),
        damage: clean(a.damage)
    }));
const norm = s => clean(s).toLocaleLowerCase("ru");
// VIEW вычисляет числовой бонус по тем же переменным, что и бросок.
// Ссылки на свойства в формулах VIEW обязательно оборачиваем в фигурные скобки.
// Если выражение нестандартное (например, с кубиком), исходная формула
// продолжает работать при броске; не показываем фиктивный числовой итог.
function bonusView(formula) {
    const normalized = formula.replace(/\[([a-z_][a-z0-9_]*)\]/gi, "$1");
    if (!/^[a-z_0-9\s.+*/()%\-]+$/i.test(normalized)) return "—";
    const expression = normalized.replace(/\b[a-z_][a-z0-9_]*\b/gi,
        variable => "{" + variable + "}");
    return "`VIEW[(" + expression + ")][math]`";
}
function render(attacks) {
    if (!attacks.length) {
        return START + "\n_Атаки ещё не добавлены._\n" + END;
    }
    const blocks = attacks.map(a => {
        const name = a.name.replace(/[\r\n`<>[\]|]/g, " ");
        const bonus = a.attack_bonus.replace(/`/g, "");
        const damage = a.damage.replace(/`/g, "");
        const attackFormula = "1d20 + " + a.attack_bonus;
        const safe = s => JSON.stringify(s);
        const hitBonus = bonusView(a.attack_bonus);
        return [
            "> > [!character-attack] " + name,
            "> >",
            "> > **БОНУС К ПОПАДАНИЮ** " + hitBonus,
            "> >",
            "> > **БРОСОК АТАКИ** `" + attackFormula.replace(/`/g, "") + "`",
            "> >",
            "> > **ФОРМУЛА УРОНА** `" + damage + "`",
            "> >",
            "> > `BUTTON[" + a.id + "_hit]` `BUTTON[" + a.id +
                "_dmg]` `BUTTON[" + a.id + "_crit]`",
            "",
            "```meta-bind-button",
            "style: primary",
            "label: Атака",
            "tooltip: Обычный клик — атака; Shift+клик — преимущество; Alt+клик — помеха",
            "id: " + a.id + "_hit",
            "hidden: true",
            "action:",
            "  type: js",
            "  file: Scripts/rolltodiscord.js",
            "  args:",
            "    name: " + safe(a.name + " — атака"),
            "    formula: " + safe(attackFormula),
            "    attackRoll: true",
            "```",
            "",
            "```meta-bind-button",
            "style: primary",
            "label: Урон",
            "id: " + a.id + "_dmg",
            "hidden: true",
            "action:",
            "  type: js",
            "  file: Scripts/rolltodiscord.js",
            "  args:",
            "    name: " + safe(a.name + " — урон"),
            "    formula: " + safe(a.damage),
            "```",
            "",
            "```meta-bind-button",
            "style: primary",
            "label: Крит",
            "tooltip: Удвоить количество костей урона; фиксированные бонусы не удваиваются",
            "id: " + a.id + "_crit",
            "hidden: true",
            "action:",
            "  type: js",
            "  file: Scripts/rolltodiscord.js",
            "  args:",
            "    name: " + safe(a.name + " — критический урон"),
            "    formula: " + safe(a.damage),
            "    criticalDamage: true",
            "```"
        ].join("\n");
    });
    return START + "\n> [!character-attacks] СПИСОК АТАК\n>\n" +
        blocks.join("\n>\n") + "\n" + END;
}
async function save(change) {
    let updated;
    await app.fileManager.processFrontMatter(file, fm => {
        updated = change(load(fm));
        fm.character_attacks = updated;
    });
    try {
        await app.vault.process(file, old => {
            const a = old.indexOf(START), b = old.indexOf(END, a + START.length);
            if (a < 0 || b < 0) throw new Error("Блок атак не найден.");
            return old.slice(0, a) + render(updated) + old.slice(b + END.length);
        });
    } catch (error) {
        new Notice("Данные сохранены, но кнопки не обновились. Нажми «Обновить атаки».");
        throw error;
    }
}
class AttackModal extends Modal {
    constructor(app, existing = null) { super(app); this.existing = existing; }
    onOpen() {
        this.contentEl.empty();
        this.contentEl.createEl("h3", {
            text: this.existing ? "Редактировать атаку" : "Добавить атаку"
        });
        let name, bonus, damage;
        new Setting(this.contentEl).setName("Название")
            .addText(t => { name = t; t.setPlaceholder("Дюрандаль");
                t.setValue(this.existing?.name ?? ""); });
        new Setting(this.contentEl).setName("Бонус броска атаки")
            .setDesc("Без 1d20. Пример: str_mod + prof + halfprof")
            .addText(t => { bonus = t; t.setPlaceholder("str_mod + prof");
                t.setValue(this.existing?.attack_bonus ?? "str_mod + prof");
                t.inputEl.style.width = "100%"; });
        new Setting(this.contentEl).setName("Урон")
            .setDesc("Примеры: 4d6 + str_mod или 2d6 + halfprofDstr_mod")
            .addText(t => { damage = t; t.setPlaceholder("2d6 + str_mod");
                t.setValue(this.existing?.damage ?? "1d6 + str_mod");
                t.inputEl.style.width = "100%"; });
        new Setting(this.contentEl)
            .addButton(button => button.setButtonText("Сохранить").setCta()
                .onClick(async () => {
                    const n = clean(name.getValue()), b = clean(bonus.getValue()),
                        d = clean(damage.getValue());
                    if (!n || !b || !d || n.length > 120 || b.length > 500 || d.length > 500) {
                        new Notice("Заполни название, бонус и урон (до 120/500 символов).");
                        return;
                    }
                    button.setDisabled(true);
                    try {
                        await save(items => {
                            if (items.some(a => norm(a.name) === norm(n) &&
                                a.id !== this.existing?.id)) {
                                throw new Error("Атака с таким названием уже есть.");
                            }
                            if (this.existing) {
                                if (!items.some(a => a.id === this.existing.id))
                                    throw new Error("Атака не найдена.");
                                return items.map(a => a.id === this.existing.id
                                    ? { ...a, name: n, attack_bonus: b, damage: d } : a);
                            }
                            const id = "atk_" + Date.now().toString(36) + "_" +
                                Math.random().toString(36).slice(2, 9);
                            return [...items, { id, name: n, attack_bonus: b, damage: d }];
                        });
                        new Notice("Атака сохранена: " + n);
                        this.close();
                    } catch (error) {
                        new Notice("Ошибка: " + (error?.message ?? String(error)));
                    } finally { button.setDisabled(false); }
                }));
    }
    onClose() { this.contentEl.empty(); }
}
const choices = load(app.metadataCache.getFileCache(file)?.frontmatter ?? {});
if (action === "add") new AttackModal(app).open();
else if (action === "refresh") {
    await save(items => items);
    new Notice("Кнопки атак обновлены.");
} else if (!choices.length) new Notice("Атак пока нет.");
else {
    class AttackPicker extends FuzzySuggestModal {
        getItems() { return choices; }
        getItemText(a) { return a.name + " · " + a.damage; }
        onChooseItem(a) {
            if (action === "edit") { new AttackModal(app, a).open(); return; }
            class ConfirmModal extends Modal {
                onOpen() {
                    this.contentEl.empty();
                    this.contentEl.createEl("h3", { text: "Удалить атаку?" });
                    this.contentEl.createEl("p", { text: a.name });
                    new Setting(this.contentEl)
                        .addButton(b => b.setButtonText("Отмена").onClick(() => this.close()))
                        .addButton(b => b.setButtonText("Удалить").setWarning()
                            .onClick(async () => {
                                b.setDisabled(true);
                                try {
                                    await save(items => items.filter(x => x.id !== a.id));
                                    this.close();
                                    new Notice("Атака удалена: " + a.name);
                                } catch (e) {
                                    new Notice("Ошибка: " + (e?.message ?? String(e)));
                                    b.setDisabled(false);
                                }
                            }));
                }
                onClose() { this.contentEl.empty(); }
            }
            new ConfirmModal(app).open();
        }
    }
    const modal = new AttackPicker(app);
    modal.setPlaceholder(action === "edit" ? "Какую атаку изменить?" : "Какую удалить?");
    modal.open();
}
