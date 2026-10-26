// JS Engine + Meta Bind: редактор собственных заклинаний D&D в Obsidian.
(async () => {
const { Notice, Modal, Setting } = obsidian;
const mode = String(context.args?.action ?? "create");
const argLevel = Number(context.args?.level);
const active = app.workspace.getActiveFile();
const classNames = ["Бард","Варвар","Воин","Волшебник","Друид","Жрец","Изобретатель","Колдун","Монах","Паладин","Плут","Следопыт","Чародей"];
const schools = ["ограждение","вызов","очарование","прорицание","воплощение","иллюзия","некромантия","преобразование"];
const castTimes = ["1 действие","1 бонусное действие","1 реакция","1 минута","10 минут","1 час","8 часов","12 часов","24 часа"];
const folder = level => level === 0 ? "Заклинания/Заговоры" : "Заклинания/" + level + " круг";
const index = level => folder(level) + "/" + (level === 0 ? "Заговоры" : level + " круг") + ".md";
const q = v => JSON.stringify(String(v ?? ""));
const markers = {
    ds: "<!-- homebrew-description-start -->",
    de: "<!-- homebrew-description-end -->",
    hs: "<!-- homebrew-higher-start -->",
    he: "<!-- homebrew-higher-end -->"
};
const section = (text, start, end) => {
    const a = text.indexOf(start);
    const b = text.indexOf(end, a + start.length);
    return a < 0 || b < 0 ? "" : text.slice(a + start.length, b).trim();
};
const validName = name => name.length > 0 && name.length <= 120 &&
    !/[\\/:*?"<>|\r\n]/.test(name) && !/^[. ]|[. ]$/.test(name) &&
    !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(name);
if (!["create","edit"].includes(mode)) {
    new Notice("Неизвестное действие редактора заклинаний.");
    return;
}
let level, editFile = null, previous = {};
if (mode === "create") {
    level = argLevel;
    if (!Number.isInteger(level) || level < 0 || level > 9 || active?.path !== index(level)) {
        new Notice("Открой страницу нужного круга заклинаний.");
        return;
    }
} else {
    const parent = active?.parent?.path ?? "";
    level = parent === "Заклинания/Заговоры" ? 0 :
        Number((parent.match(/^Заклинания\/([1-9]) круг$/) ?? [])[1]);
    const fm = active ? app.metadataCache.getFileCache(active)?.frontmatter ?? {} : {};
    if (!active || !Number.isInteger(level) || active.path === index(level) ||
        String(fm.spell_source ?? "").toLowerCase() !== "homebrew") {
        new Notice("Через эту форму можно редактировать только свои заклинания.");
        return;
    }
    editFile = active;
    const oldText = await app.vault.read(active);
    previous = {
        name: String(fm.spell_name ?? active.basename),
        school: String(fm.spell_school ?? ""),
        classes: Array.isArray(fm.spell_classes) ? fm.spell_classes.map(String) : [],
        casting: String(fm.spell_cast_time ?? ""),
        range: String(fm.spell_range ?? ""),
        components: String(fm.spell_components ?? ""),
        duration: String(fm.spell_duration ?? ""),
        ritual: Boolean(fm.spell_ritual),
        concentration: Boolean(fm.spell_concentration),
        description: section(oldText, markers.ds, markers.de),
        higher: section(oldText, markers.hs, markers.he)
    };
}
function renderSpell(d) {
    const lines = [
        "---",
        "spell_name: " + q(d.name),
        "spell_level: " + level,
        "spell_school: " + q(d.school),
        "spell_cast_time: " + q(d.casting),
        "spell_range: " + q(d.range),
        "spell_components: " + q(d.components),
        "spell_duration: " + q(d.duration),
        "spell_classes: " + JSON.stringify(d.classes),
        "spell_ritual: " + d.ritual,
        "spell_concentration: " + d.concentration,
        "spell_source: Homebrew",
        "---",
        "# " + d.name,
        "",
        "> [!info] Авторское заклинание",
        "> **Круг:** " + (level === 0 ? "Заговор" : level + " круг"),
        "> **Школа:** " + (d.school || "Не указана"),
        "> **Время накладывания:** " + d.casting,
        "> **Дистанция:** " + (d.range || "Не указана"),
        "> **Компоненты:** " + (d.components || "Не указаны"),
        "> **Длительность:** " + (d.duration || "Не указана"),
        "> **Классы:** " + (d.classes.join(", ") || "Не указаны"),
        "> **Концентрация:** " + (d.concentration ? "Да" : "Нет"),
        "> **Ритуал:** " + (d.ritual ? "Да" : "Нет"),
        "",
        "## Описание",
        "",
        markers.ds,
        d.description,
        markers.de,
        "",
        "## На более высоких уровнях",
        "",
        markers.hs,
        d.higher || "Нет.",
        markers.he,
        ""
    ];
    const fence = String.fromCharCode(96).repeat(3);
    lines.push("## Редактирование", "", fence + "meta-bind-button",
        "style: primary", "label: РЕДАКТИРОВАТЬ ЗАКЛИНАНИЕ",
        "action:", "  type: js", "  file: Scripts/custom-spell.js",
        "  args:", "    action: edit", fence, "");
    return lines.join("\n");
}
class SpellModal extends Modal {
    onOpen() {
        this.titleEl.setText(mode === "create" ?
            "Добавить заклинание — " + (level === 0 ? "Заговор" : level + " круг") :
            "Редактировать — " + previous.name);
        this.contentEl.empty();
        this.modalEl.style.width = "min(740px, 96vw)";
        this.modalEl.style.maxHeight = "90vh";
        const root = this.contentEl;
        root.createEl("p", { text: "Карточка сохраняется в библиотеку и становится доступной персонажам." });
        let nameField;
        new Setting(root).setName("Название")
            .setDesc(mode === "edit" ? "Название нельзя менять, чтобы не сломать ссылки в листах персонажей." : "Имя нового файла в выбранном круге.")
            .addText(input => {
                nameField = input;
                input.setPlaceholder("Алое копьё");
                input.setValue(previous.name ?? "");
                if (mode === "edit") input.setDisabled(true);
            });
        let school = previous.school ?? "";
        new Setting(root).setName("Школа магии").addDropdown(select => {
            select.addOption("", "Не указана");
            for (const x of schools) select.addOption(x, x);
            select.setValue(school);
            select.onChange(value => { school = value; });
        });
        const title = root.createDiv({ cls: "setting-item-name", text: "Классы (можно выбрать несколько)" });
        title.style.margin = "12px 0 6px";
        const classGrid = root.createDiv();
        classGrid.style.display = "grid";
        classGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(140px, 1fr))";
        classGrid.style.gap = "6px 12px";
        classGrid.style.marginBottom = "12px";
        const selected = new Map();
        for (const klass of classNames) {
            const label = classGrid.createEl("label");
            label.style.display = "flex";
            label.style.alignItems = "center";
            label.style.gap = "6px";
            const check = label.createEl("input", { type: "checkbox" });
            check.checked = previous.classes?.includes(klass) ?? false;
            label.appendText(klass);
            selected.set(klass, check);
        }
        let cast = castTimes.includes(previous.casting) ? previous.casting :
            (previous.casting ? "Другое" : "1 действие");
        let otherCast;
        const castSetting = new Setting(root).setName("Время накладывания")
            .setDesc("Для реакций с особым условием выбери «Другое».");
        castSetting.addDropdown(select => {
            for (const x of castTimes) select.addOption(x, x);
            select.addOption("Другое", "Другое / условие реакции");
            select.setValue(cast);
            select.onChange(value => {
                cast = value;
                otherCast.inputEl.style.display = cast === "Другое" ? "" : "none";
            });
        });
        castSetting.addText(input => {
            otherCast = input;
            input.setPlaceholder("1 реакция, когда по вам попадают");
            input.setValue(cast === "Другое" ? (previous.casting ?? "") : "");
            input.inputEl.style.display = cast === "Другое" ? "" : "none";
        });
        const fields = {};
        const addText = (key, label, hint) =>
            new Setting(root).setName(label).addText(input => {
                fields[key] = input;
                input.setPlaceholder(hint);
                input.setValue(previous[key] ?? "");
            });
        addText("range", "Дистанция", "На себя / 60 футов");
        addText("components", "Компоненты", "В, С, М (материал)");
        addText("duration", "Длительность", "Мгновенная / 1 минута");
        let concentration = Boolean(previous.concentration);
        let ritual = Boolean(previous.ritual);
        new Setting(root).setName("Концентрация").addToggle(toggle =>
            toggle.setValue(concentration).onChange(v => { concentration = v; }));
        new Setting(root).setName("Ритуал").addToggle(toggle =>
            toggle.setValue(ritual).onChange(v => { ritual = v; }));
        const textarea = (label, value, hint, rows) => {
            const wrap = root.createDiv();
            wrap.style.margin = "12px 0";
            wrap.createDiv({ cls: "setting-item-name", text: label });
            const field = wrap.createEl("textarea", { attr: {
                rows: String(rows), placeholder: hint
            } });
            field.value = value ?? "";
            field.style.display = "block";
            field.style.width = "100%";
            field.style.resize = "vertical";
            field.style.marginTop = "6px";
            return field;
        };
        const description = textarea("Описание заклинания (поддерживается Markdown)",
            previous.description, "Эффект, урон, спасброски, дополнительные условия...", 9);
        const higher = textarea("На более высоких уровнях (необязательно)",
            previous.higher === "Нет." ? "" : previous.higher,
            "Как усиливается заклинание при повышении круга?", 3);
        const footer = new Setting(root);
        footer.addButton(button => button.setButtonText(
            mode === "create" ? "Создать заклинание" : "Сохранить изменения"
        ).setCta().onClick(async () => {
            const name = nameField.getValue().trim();
            if (!validName(name)) {
                new Notice("Название должно быть 1–120 символов без символов, запрещённых в именах файлов.");
                return;
            }
            const casting = cast === "Другое" ? otherCast.getValue().trim() : cast;
            if (!casting) { new Notice("Укажи время накладывания."); return; }
            const desc = description.value.trim();
            if (!desc) { new Notice("Добавь описание заклинания."); return; }
            const upcast = higher.value.trim();
            if (Object.values(markers).some(x => desc.includes(x) || upcast.includes(x))) {
                new Notice("В описании встречается служебная метка. Удали её."); return;
            }
            const data = {
                name, school, casting,
                classes: classNames.filter(c => selected.get(c).checked),
                range: fields.range.getValue().trim(),
                components: fields.components.getValue().trim(),
                duration: fields.duration.getValue().trim(),
                concentration, ritual, description: desc, higher: upcast
            };
            const path = folder(level) + "/" + name + ".md";
            if (mode === "create" && app.vault.getMarkdownFiles().some(f =>
                f.path.toLocaleLowerCase("ru") === path.toLocaleLowerCase("ru"))) {
                new Notice("Заклинание с таким именем уже существует в этом круге.");
                return;
            }
            button.setDisabled(true);
            try {
                const markdown = renderSpell(data);
                if (mode === "create") {
                    const created = await app.vault.create(path, markdown);
                    new Notice("Заклинание добавлено: " + name);
                    this.close();
                    await app.workspace.getLeaf("tab").openFile(created);
                } else {
                    await app.vault.modify(editFile, markdown);
                    new Notice("Изменения сохранены: " + name);
                    this.close();
                }
            } catch (err) {
                button.setDisabled(false);
                new Notice("Ошибка сохранения: " + (err?.message ?? String(err)));
            }
        }));
        footer.addButton(button => button.setButtonText("Отмена").onClick(() => this.close()));
    }
    onClose() { this.contentEl.empty(); }
}
new SpellModal(app).open();
})();
