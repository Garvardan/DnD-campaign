// JS Engine + Meta Bind: черты персонажей без локального каталога.
const { Notice, Modal, Setting, FuzzySuggestModal } = obsidian;
const action = context.args?.action;
const file = app.workspace.getActiveFile();

if (!file || !(file.path.startsWith("Персонажи/") ||
    file.path === "Шаблоны/тестовый персонаж.md")) {
    new Notice("Открой лист персонажа.");
    return;
}
if (!["add", "remove"].includes(action)) {
    new Notice("Неизвестное действие с чертами.");
    return;
}

const parseFeat = item => {
    if (typeof item === "string") return { name: item.trim(), description: "" };
    // Старые ссылки сохраняем, чтобы не потерять существующие записи.
    const feat = {
        name: String(item?.name ?? "").trim(),
        description: String(item?.description ?? "")
    };
    if (item?.url) feat.url = String(item.url);
    return feat;
};
const readFeats = fm => (Array.isArray(fm.character_feats) ? fm.character_feats : [])
    .map(parseFeat).filter(item => item.name);
const normalize = name => name.toLocaleLowerCase("ru").trim();

if (action === "add") {
    class AddFeatModal extends Modal {
        onOpen() {
            this.contentEl.empty();
            this.contentEl.createEl("h3", { text: "Добавить черту" });
            let nameField;
            new Setting(this.contentEl)
                .setName("Название черты")
                .addText(input => {
                    nameField = input;
                    input.setPlaceholder("Например, Устойчивый");
                });
            this.contentEl.createEl("div", {
                text: "Описание черты (необязательно)",
                cls: "setting-item-name"
            });
            const descriptionField = this.contentEl.createEl("textarea", {
                attr: { rows: "10", placeholder: "Вставь сюда описание, особенности и условия черты..." }
            });
            descriptionField.style.display = "block";
            descriptionField.style.width = "100%";
            descriptionField.style.minHeight = "160px";
            descriptionField.style.resize = "vertical";
            descriptionField.style.marginTop = "8px";
            descriptionField.style.marginBottom = "12px";
            new Setting(this.contentEl)
                .addButton(button => button
                    .setButtonText("Добавить")
                    .setCta()
                    .onClick(async () => {
                        const name = nameField.getValue().trim();
                        const description = descriptionField.value.trim();
                        if (!name || name.length > 120) {
                            new Notice("Укажи название черты (до 120 символов).");
                            return;
                        }
                        button.setDisabled(true);
                        try {
                            await app.fileManager.processFrontMatter(file, fm => {
                                const known = readFeats(fm);
                                if (known.some(feat => normalize(feat.name) === normalize(name))) {
                                    throw new Error("Такая черта уже есть у персонажа.");
                                }
                                fm.character_feats = [...known, { name, description }];
                            });
                            this.close();
                            new Notice("Добавлена черта: " + name);
                        } catch (error) {
                            new Notice("Не удалось добавить: " + (error?.message ?? String(error)));
                        } finally {
                            button.setDisabled(false);
                        }
                    }));
        }
        onClose() { this.contentEl.empty(); }
    }
    new AddFeatModal(app).open();
} else {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const choices = readFeats(fm).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    if (!choices.length) {
        new Notice("У персонажа пока нет черт.");
        return;
    }
    class RemoveFeatModal extends FuzzySuggestModal {
        getItems() { return choices; }
        getItemText(feat) { return feat.name; }
        onChooseItem(feat) {
            app.fileManager.processFrontMatter(file, fm => {
                fm.character_feats = readFeats(fm)
                    .filter(item => normalize(item.name) !== normalize(feat.name));
            }).then(() => new Notice("Удалена черта: " + feat.name))
              .catch(error => new Notice("Не удалось удалить: " +
                  (error?.message ?? String(error))));
        }
    }
    const modal = new RemoveFeatModal(app);
    modal.setPlaceholder("Какую черту убрать?");
    modal.open();
}
