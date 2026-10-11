// En la versión estática el contenido llega por fetch, así que app.js lo
// llama tras pintar cada vista para que el fondo cubra toda la altura.
function drawBackground() {
    d3.select("#svg").selectAll("*").remove();
    if (window.backgroundTimer) window.backgroundTimer.stop();

    var body = document.body,
    html = document.documentElement;

    var width = window.innerWidth;
    var height = Math.max( body.scrollHeight, body.offsetHeight, 
                        html.clientHeight, html.scrollHeight, html.offsetHeight );

    if(height < 1200) {
        var n = 10;
    } else if(height > 1200 && height < 4000) {
        var n = 30;
    } else {
        var n = 130;
    }

    var svg = d3.select("#svg")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // Randomly generated nodes
    var nodes = d3.range(n).map(function() {
        return {
            x: width * Math.random(),
            y: height * Math.random(),
            dx: Math.random() / 2 * Math.random(),
            dy: Math.random() / 2,
            r: (Math.random() * 45) + 40
        };
    })

    var fillScale = d3.scaleLinear()
        .domain([40, 85])
        .range([0.95,0])

    var filter = svg.append("defs")
        .append("filter")
        .attr("id", "blur")
        .append("feGaussianBlur")
        .attr("stdDeviation", 4);

    var circles = svg.selectAll(".circles")
        .data(nodes)
        .enter()
        .append("circle")
        .attr("r", function(d) { return d.r})
        .attr("fill", "#DD4145")
        .attr("fill-opacity", function(d){
            return fillScale(d.r)
        })
        .attr("filter", function(d){
            if(d.r > 45) {
            return "url(#blur)"
            } else {
                return null;
            }
        });
        
    window.backgroundTimer = d3.timer(function() {

    // Update the circle positions.
    circles
        .attr("cx", function(d) { 
            // Increase your tick
            d.x += d.dx;
            // Recycle your nodes
            if (d.x > width + d.r) {
                d.x -= width + (d.r*2)
            } else if (d.x < -d.r) { 
                d.x += width + (d.r*2)
            }
            return d.x; 
        })
        .attr("cy", function(d) {
            // Increase your tick
            d.y += d.dy;
            // Recycle your nodes
            if (d.y > height + d.r) { 
                d.y -= height + (d.r*2)
            } else if (d.y < - d.r) {
                d.y += height + (d.r*2)
            }
            return d.y; 
        });
    });
}

function get6DigitsRandomly() {
    return Math.floor(100000 + Math.random() * 900000);
}

function get3DigitsRandomly() {
    return Math.floor(100 + Math.random() * 900);
}
