import buttons from "../common/buttonArr.mjs";
import toggleFade from "../common/toggleFade.mjs";

// Event handlers for json
const jsonEvtHandlers = {
    button:json=>{
        // console.log("button", json);
        pressSprites[json.data.btnKey].style.display = json.data.pressed ? "block" : "none";
    },
    config:json=>{
        if(json.config?._redeem || json.configName == "redeemdefault"){
            console.log("Received redeem config; skipping animations");
            controllerContainer.className = "";
            controllerContainer.style.display = "";
            currentlyFaded = false;
            return;
        }
        animations.newConfig();
    },
    panick:()=>{
        for(const btn of document.getElementsByClassName('btn'))
            btn.style.display = "none";

        animations.panick();
    },
}

// Animations
const animations = {
    newConfig:async()=>{
        tritone.play();
        if(currentlyFaded){
            // Pretend we're at the bottom, changing out the config
            setTimeout(()=>{
                toggleFade(controllerContainer);
                bell.play();
                currentlyFaded = false;
            }, 500);
        }
        else{
            await toggleFade(controllerContainer, false);
            toggleFade(controllerContainer);
            bell.play();
        }
    },
    // IT'S TOO MUCH FOR MR. INCREDIBLE! WHAH-HO!
    panick: async()=>{
        ctrlSprite.classList.add('panick');
        panick.play();
        await toggleFade(controllerContainer, false);
        glassBreak.play();
        ctrlSprite.classList.remove('panick');
        currentlyFaded = true;
    }
}

// Load all images and map them to an object to quickly enable/disable them
const pressSprites = {};

for(const btn of buttons){
    const resElement = document.createElement('img');
    resElement.src = "./assets/"+btn+'.svg';
    resElement.className = "btn "+btn;
    btnContainer.appendChild(resElement);
    pressSprites[btn] = resElement;
}

// Expose sprites to the window scope
window.pressSprites = pressSprites;
window.jsonEvtHandlers = jsonEvtHandlers;