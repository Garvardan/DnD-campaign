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

const parseFeat = item => ({
    name: typeof item === "string" ? item.trim() : String(item?.name ?? "").trim(),
    url: typeof item === "string" ? "" : String(item?.url ?? "").trim()
});
const readFeats = fm => (Array.isArray(fm.character_feats) ? fm.character_feats : [])
    .map(parseFeat).filter(item => item.name);
const normalize = name => name.toLocaleLowerCase("ru").trim();

if (action === "add") {
    class AddFeatModal extends Modal {
        onOpen() {
            this.contentEl.empty();
            this.contentEl.createEl("h3", { text: "Добавить черту" });
            let nameField, urlField;
            new Setting(this.contentEl)
                .setName("Название черты")
                .addText(input => {
                    nameField = input;
                    input.setPlaceholder("Например, Устойчивый");
                });
            new Setting(this.contentEl)
                .setName("Ссылка на описание (необязательно)")
                .setDesc("Сохраняется только ссылка, отдельная заметка не создаётся.")
                .addText(input => {
                    urlField = input;
                    input.setPlaceholder("https://...");
                });
            new Setting(this.contentEl)
                .addButton(button => button
                    .setButtonText("Добавить")
                    .setCta()
                    .onClick(async () => {
                        const name = nameField.getValue().trim();
                        const url = urlField.getValue().trim();
                        if (!name || name.length > 120) {
                            new Notice("Укажи название черты (до 120 символов).");
                            return;
                        }
                        if (url && (!/^https?:\/\/\S+$/i.test(url) || url.length > 700)) {
                            new Notice("Ссылка должна начинаться с https:// или http://.");
                            return;
                        }
                        button.setDisabled(true);
                        try {
                            await app.fileManager.processFrontMatter(file, fm => {
                                const known = readFeats(fm);
                                if (known.some(feat => normalize(feat.name) === normalize(name))) {
                                    throw new Error("Такая черта уже есть у персонажа.");
                                }
                                fm.character_feats = [...known, { name, url }];
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
