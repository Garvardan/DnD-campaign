// JS Engine + Meta Bind: способности персонажа, хранящиеся только в YAML листа.
(async () => {
    const { Notice, Modal, Setting, FuzzySuggestModal } = obsidian;
    const action = String(context.args?.action ?? "");
    const file = app.workspace.getActiveFile();

    if (!file || !(
        (file.path.startsWith("Персонажи/") && file.extension === "md") ||
        file.path === "Шаблоны/тестовый персонаж.md"
    )) {
        new Notice("Открой лист персонажа.");
        return;
    }
    if (!["add", "edit", "remove"].includes(action)) {
        new Notice("Неизвестное действие со способностями.");
        return;
    }

    const clean = value => String(value ?? "").trim();
    const normalize = value => clean(value).toLocaleLowerCase("ru");
    const makeId = () => "ability_" + Date.now().toString(36) + "_" +
        Math.random().toString(36).slice(2, 9);
    // Сохраняем порядок и дополнительные поля уже существующих способностей.
    const read = fm => (Array.isArray(fm.character_abilities) ? fm.character_abilities : [])
        .map((raw, index) => {
            if (typeof raw === "string") {
                return { id: "ability_legacy_" + index, name: clean(raw),
                    source: "", activation: "", recharge: "", description: "" };
            }
            if (!raw || typeof raw !== "object") return null;
            return {
                ...raw,
                id: clean(raw.id) || "ability_legacy_" + index,
                name: clean(raw.name),
                source: clean(raw.source),
                activation: clean(raw.activation),
                recharge: clean(raw.recharge),
                description: String(raw.description ?? "")
            };
        }).filter(item => item && item.name);

    const metadata = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const selected = read(metadata);

    class AbilityEditor extends Modal {
        constructor(app, target = null) {
            super(app);
            this.target = target;
        }
        onOpen() {
            this.contentEl.empty();
            this.titleEl.setText(this.target ? "Редактировать способность" : "Добавить способность");
            this.modalEl.style.width = "min(760px, 96vw)";
            this.modalEl.style.maxHeight = "90vh";

            const fields = {};
            const addText = (key, title, example) => {
                new Setting(this.contentEl).setName(title).addText(input => {
                    fields[key] = input;
                    input.setPlaceholder(example);
                    input.setValue(this.target?.[key] ?? "");
                });
            };
            addText("name", "Название", "Например, Божественное покровительство");
            addText("source", "Источник (необязательно)", "Например, подкласс / раса / дар");
            addText("activation", "Активация (необязательно)", "Действие, реакция, пассивная");
            addText("recharge", "Восстановление (необязательно)", "Короткий или длинный отдых");

            this.contentEl.createDiv({
                cls: "setting-item-name", text: "Описание способности"
            });
            const description = this.contentEl.createEl("textarea", {
                attr: { rows: "10", placeholder:
                    "Эффект, условия применения, бонусы и ограничения способности..."
                }
            });
            description.value = this.target?.description ?? "";
            description.style.display = "block";
            description.style.width = "100%";
            description.style.minHeight = "180px";
            description.style.resize = "vertical";
            description.style.margin = "8px 0 12px";

            const footer = new Setting(this.contentEl);
            footer.addButton(button => button
                .setButtonText(this.target ? "Сохранить изменения" : "Добавить способность")
                .setCta()
                .onClick(async () => {
                    const values = {
                        name: clean(fields.name.getValue()),
                        source: clean(fields.source.getValue()),
                        activation: clean(fields.activation.getValue()),
                        recharge: clean(fields.recharge.getValue()),
                        description: description.value.trim()
                    };
                    if (!values.name || values.name.length > 120) {
                        new Notice("Укажи название способности (не более 120 символов).");
                        return;
                    }
                    button.setDisabled(true);
                    try {
                        await app.fileManager.processFrontMatter(file, fm => {
                            const list = read(fm);
                            if (list.some(item => normalize(item.name) === normalize(values.name) &&
                                (!this.target || item.id !== this.target.id))) {
                                throw new Error("Способность с таким названием уже есть.");
                            }
                            if (this.target) {
                                const at = list.findIndex(item => item.id === this.target.id);
                                if (at < 0) throw new Error("Способность уже удалена или изменена.");
                                list[at] = { ...list[at], ...values };
                            } else {
                                let id = makeId();
                                while (list.some(item => item.id === id)) id = makeId();
                                list.push({ id, ...values });
                            }
                            fm.character_abilities = list;
                        });
                        this.close();
                        new Notice(this.target
                            ? "Способность обновлена: " + values.name
                            : "Способность добавлена: " + values.name);
                    } catch (error) {
                        new Notice("Ошибка сохранения способности: " + (error?.message ?? error));
                        button.setDisabled(false);
                    }
                }));
            footer.addButton(button => button.setButtonText("Отмена")
                .onClick(() => this.close()));
        }
        onClose() {
            this.contentEl.empty();
        }
    }

    if (action === "add") {
        new AbilityEditor(app).open();
        return;
    }
    if (!selected.length) {
        new Notice("У персонажа пока нет добавленных карточек способностей.");
        return;
    }
    class AbilityPicker extends FuzzySuggestModal {
        getItems() {
            return selected;
        }
        getItemText(ability) {
            return ability.name + (ability.source ? " · " + ability.source : "");
        }
        onChooseItem(ability) {
            if (action === "edit") {
                new AbilityEditor(app, ability).open();
                return;
            }
            app.fileManager.processFrontMatter(file, fm => {
                const list = read(fm);
                if (!list.some(item => item.id === ability.id)) {
                    throw new Error("Способность уже удалена.");
                }
                fm.character_abilities = list.filter(item => item.id !== ability.id);
            }).then(() => new Notice("Удалена способность: " + ability.name))
              .catch(error => new Notice("Ошибка удаления способности: " +
                  (error?.message ?? error)));
        }
    }
    const picker = new AbilityPicker(app);
    picker.setPlaceholder(action === "edit"
        ? "Какую способность редактировать?"
        : "Какую способность удалить?");
    picker.open();
})();
