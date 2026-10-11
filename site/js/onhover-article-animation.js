function addBlur(element) {
    if(!element.classList.contains('blur')) {
        element.classList.add('blur')
    }
}

function removeBlur(element) {
    if(element.classList.contains('blur')) {
        element.classList.remove('blur')
    }
}

function getSource(element) {
    return element.children[0].children[0].children[6].children[0]
}

function highlightFontColor(element) {
    if(element.classList.contains('text-danger')) {
        element.classList.remove('text-danger')
        element.classList.add('text-white')
    } 
}

function adjustFontColor(element) {
    if(element.classList.contains('text-white')) {
        element.classList.remove('text-white')
        element.classList.add('text-danger')
    } 
}

function getAllArticles() {
    return document.querySelectorAll('.card')
}
function highlight(element) {
    let articles = getAllArticles()

    articles.forEach(article => {
        if(article.id !== element.id) {
            addBlur(article)
        } else {
            highlightFontColor(getSource(element))
            element.classList.add('flashing')
        }
    });
}

function readjust(element) {
    let articles = getAllArticles()

    articles.forEach(article => {
            removeBlur(article)
    });

    adjustFontColor(getSource(element))
}
/* 
document.addEventListener("DOMContentLoaded", function() {

});
 */