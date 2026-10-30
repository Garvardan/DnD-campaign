// Кнопка СБРОСИТЬ возле HP: подтверждение перед обнулением текущих HP.
// Максимальные HP, временные HP и остальные свойства не изменяются.
const { Modal, Setting, Notice } = obsidian;
const file = app.workspace.getActiveFile();
if (!file || !(file.path.startsWith("Персонажи/") ||
    file.path === "Шаблоны/тестовый персонаж.md")) {
    new Notice("Открой лист персонажа, чтобы сбросить HP.");
    return;
}

class ResetHpModal extends Modal {
    onOpen() {
        this.titleEl.setText("Сбросить HP?");
        this.contentEl.createEl("p", {
            text: "Ты уверен, что хочешь сбросить текущие HP до 0? " +
                  "Максимальные и временные HP не изменятся."
        });
        new Setting(this.contentEl)
            .addButton(button => button
                .setButtonText("Отмена")
                .onClick(() => this.close()))
            .addButton(button => {
                button.setButtonText("Да, сбросить");
                if (typeof button.setWarning === "function") button.setWarning();
                button.onClick(async () => {
                    button.setDisabled(true);
                    try {
                        await app.fileManager.processFrontMatter(file, fm => {
                            fm.hp = 0;
                        });
                        this.close();
                        new Notice("Текущие HP сброшены до 0.");
                    } catch (error) {
                        button.setDisabled(false);
                        new Notice("Не удалось сбросить HP: " +
                            String(error?.message ?? error));
                    }
                });
            });
    }
    onClose() {
        this.contentEl.empty();
    }
}
new ResetHpModal(app).open();
