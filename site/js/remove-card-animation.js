function removeCard(id) {
    let card = $("#" + id)
    card.animate({
        opacity: 0.1,
        left: "+=5000",
        height: "toggle"
      })
}