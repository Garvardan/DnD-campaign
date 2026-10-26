// Редактирование описания персонажа, сохраняемого в YAML character_description.
(async () => {
const {Notice,Modal,Setting}=obsidian;
const file=app.workspace.getActiveFile();
if(!file || !file.path.startsWith("Персонажи/") && file?.path!=="Шаблоны/тестовый персонаж.md"){
    new Notice("Открой лист персонажа.");return;
}
const fm=app.metadataCache.getFileCache(file)?.frontmatter??{};
class DescriptionModal extends Modal {
    onOpen(){
        this.titleEl.setText("Описание персонажа");
        this.contentEl.empty();
        this.modalEl.style.width="min(760px, 96vw)";
        this.contentEl.createEl("p",{text:"Биография, внешний вид, характер, предыстория и заметки. Можно использовать Markdown и ссылки Obsidian."});
        const area=this.contentEl.createEl("textarea",{attr:{
            rows:"18",placeholder:"Внешность, история, особенности характера, цели..."
        }});
        area.value=String(fm.character_description??"");
        area.style.width="100%";area.style.minHeight="240px";
        area.style.resize="vertical";
        new Setting(this.contentEl)
            .addButton(button=>button.setButtonText("Сохранить").setCta().onClick(async()=>{
                button.setDisabled(true);
                try{
                    await app.fileManager.processFrontMatter(file,fm=>{
                        fm.character_description=area.value.trim();
                    });
                    this.close();new Notice("Описание персонажа сохранено.");
                }catch(err){
                    button.setDisabled(false);
                    new Notice("Ошибка сохранения описания: "+(err?.message??err));
                }
            }))
            .addButton(button=>button.setButtonText("Отмена").onClick(()=>this.close()));
    }
    onClose(){this.contentEl.empty();}
}
new DescriptionModal(app).open();
})();
