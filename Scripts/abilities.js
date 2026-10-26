// JS Engine + Meta Bind: карточки способностей в YAML персонажа, без отдельных файлов.
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
    if (!["add", "edit", "remove", "restore_all"].includes(action)) {
        new Notice("Неизвестное действие со способностями.");
        return;
    }

    const clean = value => String(value ?? "").trim();
    const normalize = value => clean(value).toLocaleLowerCase("ru");
    const checked = value => value === true || value === "true" || value === 1;
    const makeId = () => "ability_" + Date.now().toString(36) + "_" +
        Math.random().toString(36).slice(2, 9);
    const oldRestFlags = text => {
        const value = clean(text).toLocaleLowerCase("ru");
        return {
            short: /коротк|short/.test(value),
            long: /длинн|продолжительн|long/.test(value)
        };
    };
    const read = fm => (Array.isArray(fm.character_abilities) ? fm.character_abilities : [])
        .map((raw, index) => {
            const item = typeof raw === "string"
                ? { name: clean(raw) } : (raw && typeof raw === "object" ? raw : null);
            if (!item) return null;
            const maxRaw = Number(item.charges_max);
            const max = Number.isSafeInteger(maxRaw) && maxRaw > 0 ? maxRaw : null;
            const chargeRaw = item.charges === undefined || item.charges === null
                ? max : Number(item.charges);
            const charges = max === null ? null : (
                Number.isSafeInteger(chargeRaw) ? Math.max(0, Math.min(max, chargeRaw)) : max
            );
            const legacy = oldRestFlags(item.recharge);
            const explicitShort = item.recharge_short !== undefined && item.recharge_short !== null;
            const explicitLong = item.recharge_long !== undefined && item.recharge_long !== null;
            const rechargeShort = explicitShort ? checked(item.recharge_short) : legacy.short;
            const rechargeLong = explicitLong ? checked(item.recharge_long)
                : (legacy.long || (!item.recharge && max !== null));
            const rechargeNote = clean(item.recharge_note) || (
                !legacy.short && !legacy.long ? clean(item.recharge) : ""
            );
            return {
                ...item,
                id: clean(item.id) || "ability_legacy_" + index,
                name: clean(item.name),
                source: clean(item.source),
                activation: clean(item.activation),
                description: String(item.description ?? ""),
                charges_max: max,
                charges,
                recharge_short: rechargeShort,
                recharge_long: rechargeLong,
                recharge_note: rechargeNote
            };
        }).filter(item => item && item.name);

    if (action === "restore_all") {
        let restored = 0;
        try {
            await app.fileManager.processFrontMatter(file, fm => {
                const old = Array.isArray(fm.character_abilities) ? fm.character_abilities : [];
                fm.character_abilities = old.map(item => {
                    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
                    const max = Number(item.charges_max);
                    if (!Number.isSafeInteger(max) || max < 1) return item;
                    const current = item.charges == null ? max : Number(item.charges);
                    if (current === max) return item;
                    restored++;
                    return { ...item, charges: max };
                });
            });
            new Notice(restored
                ? "Заряды восстановлены у " + restored + " способностей."
                : "Все заряды способностей уже восстановлены.");
        } catch (error) {
            new Notice("Ошибка восстановления способностей: " + (error?.message ?? error));
        }
        return;
    }

    const selected = read(app.metadataCache.getFileCache(file)?.frontmatter ?? {});

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
            addText("source", "Источник (необязательно)", "Подкласс, раса, дар...");
            addText("activation", "Активация (необязательно)", "Действие, реакция, пассивная...");

            let chargeEnabled = this.target?.charges_max !== null &&
                this.target?.charges_max !== undefined;
            const chargeFields = {};
            let chargePanel = null;
            new Setting(this.contentEl).setName("Использует заряды")
                .setDesc("Если выключено, способность не имеет счётчика использований.")
                .addToggle(toggle => toggle.setValue(chargeEnabled)
                    .onChange(value => {
                        chargeEnabled = value;
                        if (chargePanel) chargePanel.style.display = value ? "" : "none";
                    }));
            chargePanel = this.contentEl.createDiv();
            chargePanel.style.marginBottom = "12px";
            const panel = chargePanel;
            const note = panel.createDiv({ cls: "setting-item-description",
                text: "Текущее количество можно менять и после создания способности." });
            note.style.marginBottom = "8px";
            new Setting(panel).setName("Максимум зарядов")
                .addText(input => {
                    chargeFields.maximum = input;
                    input.setPlaceholder("Например, 3");
                    input.setValue(this.target?.charges_max == null
                        ? "1" : String(this.target.charges_max));
                });
            new Setting(panel).setName("Текущие заряды")
                .setDesc("Оставь пустым для полного запаса.")
                .addText(input => {
                    chargeFields.current = input;
                    input.setPlaceholder("Полный запас");
                    input.setValue(this.target?.charges == null
                        ? "" : String(this.target.charges));
                });
            let rechargeShort = Boolean(this.target?.recharge_short);
            let rechargeLong = this.target
                ? Boolean(this.target.recharge_long) : true;
            new Setting(panel).setName("Короткий отдых")
                .setDesc("Восстанавливать заряды при коротком отдыхе.")
                .addToggle(toggle => toggle.setValue(rechargeShort)
                    .onChange(value => { rechargeShort = value; }));
            new Setting(panel).setName("Длинный отдых")
                .setDesc("Восстанавливать заряды при длинном отдыхе.")
                .addToggle(toggle => toggle.setValue(rechargeLong)
                    .onChange(value => { rechargeLong = value; }));
            new Setting(panel).setName("Особая перезарядка (необязательно)")
                .setDesc("Например, на рассвете. Указанные условия не восстанавливаются автоматически.")
                .addText(input => {
                    chargeFields.note = input;
                    input.setPlaceholder("На рассвете, раз за сцену...");
                    input.setValue(this.target?.recharge_note ?? "");
                });
            panel.style.display = chargeEnabled ? "" : "none";

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
                    const name = clean(fields.name.getValue());
                    if (!name || name.length > 120) {
                        new Notice("Укажи название способности (не более 120 символов).");
                        return;
                    }

                    let max = null, current = null;
                    if (chargeEnabled) {
                        const maxValue = Number(chargeFields.maximum.getValue().trim());
                        if (!Number.isSafeInteger(maxValue) || maxValue < 1 || maxValue > 9999) {
                            new Notice("Максимум зарядов должен быть целым числом от 1 до 9999.");
                            return;
                        }
                        max = maxValue;
                        const rawCurrent = chargeFields.current.getValue().trim();
                        const currentValue = rawCurrent === "" ? max : Number(rawCurrent);
                        if (!Number.isSafeInteger(currentValue) || currentValue < 0 || currentValue > max) {
                            new Notice("Текущие заряды должны быть от 0 до " + max + ".");
                            return;
                        }
                        current = currentValue;
                    }

                    const values = {
                        name,
                        source: clean(fields.source.getValue()),
                        activation: clean(fields.activation.getValue()),
                        description: description.value.trim(),
                        charges_max: max,
                        charges: current,
                        recharge_short: chargeEnabled && rechargeShort,
                        recharge_long: chargeEnabled && rechargeLong,
                        recharge_note: chargeEnabled ? clean(chargeFields.note.getValue()) : ""
                    };
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
                                delete list[at].recharge;
                            } else {
                                let id = makeId();
                                while (list.some(item => item.id === id)) id = makeId();
                                list.push({ id, ...values });
                            }
                            fm.character_abilities = list;
                        });
                        this.close();
                        new Notice(this.target
                            ? "Способность обновлена: " + name
                            : "Способность добавлена: " + name);
                    } catch (error) {
                        new Notice("Ошибка сохранения способности: " + (error?.message ?? error));
                        button.setDisabled(false);
                    }
                }));
            footer.addButton(button => button.setButtonText("Отмена")
                .onClick(() => this.close()));
        }
        onClose() { this.contentEl.empty(); }
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
        getItems() { return selected; }
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
