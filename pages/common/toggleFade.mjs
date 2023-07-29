function toggleFade(targetElement, show = true){
    targetElement.className =  "";
    targetElement.style.display = show ? "none": "";

    return new Promise((res)=>{
        // I don't know what it is, but neither firefox or chrome don't play the animation again if I don't add some kind of delay
        setTimeout(()=>{
            targetElement.classList.add((show ? "": "dis") + "appear");
            if(show) targetElement.style.display = "";
            setTimeout(()=>{
                if(!show) targetElement.style.display = "none";
                res(true);
            }, 500);
        }, 50);
    });
}

export default toggleFade;