// JS Engine + Meta Bind: предметы и снаряжение персонажей.
(async () => {
const {Notice,Modal,Setting,FuzzySuggestModal}=obsidian;
const action=String(context.args?.action??"");
const file=app.workspace.getActiveFile();
const isChar=f=>!!f&&f.extension==="md"&&(f.path.startsWith("Персонажи/")||f.path==="Шаблоны/тестовый персонаж.md");
const isItem=f=>!!f&&f.extension==="md"&&f.path.startsWith("Предметы/")&&!/^Предметы\/(?:Каталог|README)\.md$/.test(f.path);
const norm=s=>String(s??"").trim().toLocaleLowerCase("ru");
const read=fm=>(Array.isArray(fm.character_equipment)?fm.character_equipment:[]).map(x=>
    typeof x==="string"?{path:x,quantity:1,equipped:false,attuned:false}:{
        ...x,path:String(x?.path??""),quantity:Math.max(1,Math.floor(Number(x?.quantity)||1)),
        equipped:Boolean(x?.equipped),attuned:Boolean(x?.attuned)
    }).filter(x=>x.path.startsWith("Предметы/")&&x.path.endsWith(".md"));
const catalog=()=>app.vault.getMarkdownFiles().filter(isItem).sort((a,b)=>a.basename.localeCompare(b.basename,"ru"));
const itemName=path=>app.vault.getAbstractFileByPath(path)?.basename??path.split("/").pop().replace(/\.md$/,"");
async function give(character,path){
    if(!isItem(app.vault.getAbstractFileByPath(path)))throw Error("Карточка предмета не найдена.");
    await app.fileManager.processFrontMatter(character,fm=>{
        const entries=read(fm),item=entries.find(x=>norm(x.path)===norm(path));
        if(item)item.quantity+=1;
        else entries.push({path,quantity:1,equipped:false,attuned:false});
        fm.character_equipment=entries;
    });
}
if(action==="add"){
    if(!isChar(file)){new Notice("Открой лист персонажа.");return;}
    const choices=catalog(),owned=read(app.metadataCache.getFileCache(file)?.frontmatter??{});
    if(!choices.length){new Notice("В папке «Предметы» нет карточек.");return;}
    class Picker extends FuzzySuggestModal{
        getItems(){return choices;}
        getItemText(f){const o=owned.find(x=>x.path===f.path);return f.basename+(o?" · уже есть ×"+o.quantity:"");}
        onChooseItem(f){give(file,f.path).then(()=>new Notice("Добавлено: "+f.basename))
            .catch(e=>new Notice("Ошибка добавления: "+(e?.message??e)));}
    }
    const picker=new Picker(app);picker.setPlaceholder("Выбери предмет из папки «Предметы»...");picker.open();return;
}
if(action==="remove"){
    if(!isChar(file)){new Notice("Открой лист персонажа.");return;}
    const choices=read(app.metadataCache.getFileCache(file)?.frontmatter??{});
    if(!choices.length){new Notice("Снаряжение пока пусто.");return;}
    class Picker extends FuzzySuggestModal{
        getItems(){return choices;}
        getItemText(x){return itemName(x.path)+" ×"+x.quantity;}
        onChooseItem(x){app.fileManager.processFrontMatter(file,fm=>{
            fm.character_equipment=read(fm).filter(item=>item.path!==x.path);
        }).then(()=>new Notice("Убрано из снаряжения: "+itemName(x.path)))
          .catch(e=>new Notice("Ошибка удаления: "+(e?.message??e)));}
    }
    const picker=new Picker(app);picker.setPlaceholder("Какой предмет убрать?");picker.open();return;
}
if(action==="give"){
    if(!isItem(file)){new Notice("Открой карточку предмета.");return;}
    const choices=app.vault.getMarkdownFiles().filter(f=>f.path.startsWith("Персонажи/"));
    if(!choices.length){new Notice("Персонажи не найдены.");return;}
    class Picker extends FuzzySuggestModal{
        getItems(){return choices;}
        getItemText(f){const fm=app.metadataCache.getFileCache(f)?.frontmatter??{};return String(fm.character_name||f.basename);}
        onChooseItem(f){give(f,file.path).then(()=>new Notice(file.basename+" добавлен персонажу "+f.basename))
            .catch(e=>new Notice("Ошибка: "+(e?.message??e)));}
    }
    const picker=new Picker(app);picker.setPlaceholder("Кому выдать "+file.basename+"?");picker.open();return;
}
if(!["create","edit"].includes(action)){new Notice("Неизвестное действие снаряжения.");return;}
if(action==="create"&&!isChar(file)&&file?.path!=="Предметы/Каталог.md"){
    new Notice("Создай предмет из листа персонажа или каталога.");return;
}
if(action==="edit"&&!isItem(file)){new Notice("Открой карточку предмета.");return;}
const marker={
    h0:"<!-- equipment-history-start -->",h1:"<!-- equipment-history-end -->",
    m0:"<!-- equipment-mechanics-start -->",m1:"<!-- equipment-mechanics-end -->",
    a0:"<!-- equipment-appearance-start -->",a1:"<!-- equipment-appearance-end -->",
    e0:"<!-- equipment-extra-start -->",e1:"<!-- equipment-extra-end -->"
};
const between=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);return i<0||j<0?"":s.slice(i+a.length,j).trim();};
let initial={name:"",type:"Оружие",rarity:"Обычный",attune:false,image:"",
    appearance:"",history:"",mechanics:"",extra:""};
if(action==="edit"){
    const fm=app.metadataCache.getFileCache(file)?.frontmatter??{};
    if(String(fm.item_source??"").toLowerCase()!=="homebrew"){
        new Notice("Старые карточки, включая Дюрандаль, редактируются непосредственно в Markdown.");return;
    }
    const text=await app.vault.read(file);
    initial={
        name:String(fm.item_name??file.basename),type:String(fm.item_type??""),
        rarity:String(fm.item_rarity??""),attune:Boolean(fm.item_attunement),
        image:String(fm.item_image??""),
        appearance:between(text,marker.a0,marker.a1),
        history:between(text,marker.h0,marker.h1),
        mechanics:between(text,marker.m0,marker.m1),
        extra:between(text,marker.e0,marker.e1)
    };
}
const rare=["Обычный","Необычный","Редкий","Очень редкий","Легендарный","Артефакт","Уникальный","Другое"];
const quote=s=>JSON.stringify(String(s??""));
const safe=s=>s.length>0&&s.length<=120&&!/[\\/:*?"<>|\r\n]/.test(s)&&!/^[. ]|[. ]$/.test(s)&&!/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(s);
function render(d){
    const tick=String.fromCharCode(96),fence=tick.repeat(3);
    const image=String(d.image).replace(/^!\[\[/,"").replace(/\]\]$/,"");
    return [
        "---","item_name: "+quote(d.name),"item_type: "+quote(d.type),
        "item_rarity: "+quote(d.rarity),"item_attunement: "+d.attune,
        "item_image: "+quote(image),"item_source: Homebrew","---",
        "# "+d.name,"",
        "> [!main] ПРЕДМЕТ",
        "> **Тип:** "+d.type,"> **Редкость:** "+d.rarity,
        "> **Настройка:** "+(d.attune?"требуется":"не требуется"),"",
        image?"![["+image+"]]":"", "",
        "## Внешний вид",marker.a0,d.appearance,marker.a1,"",
        "## История",marker.h0,d.history,marker.h1,"",
        "## Механики",marker.m0,d.mechanics,marker.m1,"",
        "## Дополнительно",marker.e0,d.extra,marker.e1,"",
        "> [!main] "+tick+"BUTTON[equipment_edit_card]"+tick+" "+tick+"BUTTON[equipment_give_card]"+tick,
        fence+"meta-bind-button","style: primary","label: РЕДАКТИРОВАТЬ КАРТОЧКУ",
        "id: equipment_edit_card","hidden: true","action:","  type: js",
        "  file: Scripts/equipment.js","  args:","    action: edit",fence,"",
        fence+"meta-bind-button","style: primary","label: ДОБАВИТЬ ПЕРСОНАЖУ",
        "id: equipment_give_card","hidden: true","action:","  type: js",
        "  file: Scripts/equipment.js","  args:","    action: give",fence,""
    ].join("\n");
}
class Editor extends Modal{
    onOpen(){
        this.titleEl.setText(action==="create"?"Создать предмет":"Редактировать предмет");
        this.contentEl.empty();
        this.modalEl.style.width="min(780px, 96vw)";
        this.modalEl.style.maxHeight="90vh";
        const root=this.contentEl,fields={};
        root.createEl("p",{text:"Карточка в стиле Дюрандаля: тип, редкость, изображение, история и механики. Описания поддерживают Markdown."});
        const addText=(key,title,hint,disabled=false)=>new Setting(root).setName(title).addText(input=>{
            fields[key]=input;input.setPlaceholder(hint);input.setValue(initial[key]??"");
            if(disabled)input.setDisabled(true);
        });
        addText("name","Название","Название предмета",action==="edit");
        addText("type","Тип предмета","Оружие, двуручный меч");
        let rarity=rare.includes(initial.rarity)?initial.rarity:"Другое",custom;
        const row=new Setting(root).setName("Редкость");
        row.addDropdown(drop=>{
            rare.forEach(x=>drop.addOption(x,x));
            drop.setValue(rarity);drop.onChange(x=>{
                rarity=x;custom.inputEl.style.display=x==="Другое"?"":"none";
            });
        });
        row.addText(input=>{
            custom=input;input.setPlaceholder("Другая редкость");
            input.setValue(rarity==="Другое"?initial.rarity:"");
            input.inputEl.style.display=rarity==="Другое"?"":"none";
        });
        let attune=initial.attune;
        new Setting(root).setName("Требуется настройка").addToggle(t=>t.setValue(attune).onChange(v=>{attune=v;}));
        addText("image","Изображение (необязательно)","Имя изображения в хранилище, например Pasted image.png|288");
        const area=(key,label,rows)=>{const c=root.createDiv();c.style.margin="10px 0";
            c.createDiv({cls:"setting-item-name",text:label});
            const x=c.createEl("textarea",{attr:{rows:String(rows)}});x.value=initial[key]??"";
            x.style.width="100%";x.style.resize="vertical";x.style.marginTop="6px";fields[key]=x;};
        area("appearance","Внешний вид",3);
        area("history","История",7);
        area("mechanics","Механики и свойства",10);
        area("extra","Дополнительно",3);
        const footer=new Setting(root);
        footer.addButton(button=>button.setButtonText(action==="create"?"СОЗДАТЬ ПРЕДМЕТ":"СОХРАНИТЬ")
            .setCta().onClick(async()=>{
                const name=fields.name.getValue().trim();
                if(!safe(name)){new Notice("Некорректное название (1–120 символов, без запрещённых знаков).");return;}
                const d={name,type:fields.type.getValue().trim(),
                    rarity:rarity==="Другое"?custom.getValue().trim():rarity,
                    image:fields.image.getValue().trim(),attune,
                    appearance:fields.appearance.value.trim(),history:fields.history.value.trim(),
                    mechanics:fields.mechanics.value.trim(),extra:fields.extra.value.trim()};
                if(!d.type||!d.rarity||!d.mechanics){new Notice("Заполни тип, редкость и механики предмета.");return;}
                if(Object.values(marker).some(tag=>[d.appearance,d.history,d.mechanics,d.extra].some(s=>s.includes(tag)))){
                    new Notice("Описание содержит служебные маркеры.");return;
                }
                const path="Предметы/"+name+".md";
                if(action==="create"&&app.vault.getMarkdownFiles().some(f=>norm(f.path)===norm(path))){
                    new Notice("Предмет с таким названием уже существует.");return;
                }
                button.setDisabled(true);
                try{
                    if(action==="edit"){
                        await app.vault.modify(file,render(d));new Notice("Карточка сохранена: "+name);
                        this.close();
                    }else{
                        const created=await app.vault.create(path,render(d));
                        if(isChar(file))await give(file,created.path);
                        new Notice("Создан предмет: "+name+(isChar(file)?" (добавлен персонажу)":""));
                        this.close();await app.workspace.getLeaf("tab").openFile(created);
                    }
                }catch(e){button.setDisabled(false);new Notice("Ошибка сохранения: "+(e?.message??e));}
            }));
        footer.addButton(b=>b.setButtonText("Отмена").onClick(()=>this.close()));
    }
    onClose(){this.contentEl.empty();}
}
new Editor(app).open();
})();
