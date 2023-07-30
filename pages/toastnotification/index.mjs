import toggleFade from "../common/toggleFade.mjs";

window.wsListeners = ["macro"];
window.jsonEvtHandlers = {
    "macro":async json=>{
        toast.children[0].innerText = json.user + " triggered: " + json.command;
        notifySound.play();
        await toggleFade(toast);
        setTimeout(()=>toggleFade(toast, false), 5000);
    }
}

// lazy import so stuff is in one file XP
import("../common/serverConnection.mjs");