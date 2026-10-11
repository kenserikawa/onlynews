function getAll() {
    return document.querySelectorAll('.category-button')
}

function toggleSelected(hoverElement) {
    let buttons = getAll()
    let route = getSimpleRoute()
    
    if(!isRouteCategory(hoverElement, route)) {
        for (let i = 0; i < buttons.length; i++) {
            const element = buttons[i];
            if(element.classList.contains('w-25')) {
                if(isRouteCategory(hoverElement, route)) {
                    element.classList.remove('w-25')
                    element.classList.remove('bg-danger')
                    element.classList.add('text-danger')
                }
            } 
        }
        hoverElement.classList.add('w-25')
        hoverElement.classList.remove('text-danger')
        hoverElement.classList.add('text-white')
    } 
} 

function undoToggling(hoveredElement) {
    let route = getSimpleRoute()
    if(isRouteCategory(hoveredElement, route)) {
    } else {
        hoveredElement.classList.remove('w-25')
        hoveredElement.classList.remove('bg-danger')
        hoveredElement.classList.add('text-danger')
    }
}

function isRouteCategory(element, route) {
    if(element.id !== route) {
        return false
    }
    return true
}

function getSimpleRoute() {
    let url = window.location.href
    return "/" + url.substring(url.lastIndexOf("/") + 1)
}
