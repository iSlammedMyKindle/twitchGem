// Import the buttons - this will be used to display the default layout
import buttons from "../common/buttonArr.mjs";
import toggleFade from "../common/toggleFade.mjs";

window.jsonEvtHandlers = {
    config:async json=>{
        if(json.config?._redeem || json.configName == "redeemdefault"){
            console.log("Received redeem config; skipping list change");
            currentlyFaded = false;
            return;
        }
        
        if(!currentlyFaded) await toggleFade(listContainer, false);

        loadButtons(json.configName == "default" ? buttons : Object.keys(json.config));
        toggleFade(listContainer);
        currentlyFaded = false;
    },
    panick:()=>{
        toggleFade(listContainer, false);
        currentlyFaded = true;
    },
}

window.restFetch = json=>{
    console.log(json.msg);
    if(json.msg?.config || json.msg?.defaultConf){
        // Make the list visible
        currentlyFaded = false;
        listContainer.style.display = "";

        loadButtons(json.msg?.defaultConf ? buttons : Object.keys(json.msg.config));
    }
}

function loadButtons(list){
    // Load the command list
    list = list.sort((a,b)=> a.length > b.length ? 1 : -1);
    cmdList.innerHTML = "";
    for(const btn of list){
        const res = document.createElement('div');
        res.innerText = "."+btn;
        cmdList.appendChild(res);
    }
}