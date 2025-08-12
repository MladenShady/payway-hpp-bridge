import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

dotenv.config();

var app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get("/health", function(req, res){
  res.status(200).send("OK");
});

function looksLikeToken(s){
  return typeof s === "string" && s.length >= 20 && /^[A-Za-z0-9\-_]+$/.test(s);
}

app.post("/initiate-payment", async function(req, res){
  try{
    var student_name = req.body.student_name || "";
    var date_of_birth = req.body.date_of_birth || "";
    var email = req.body.email || "";
    var student_id = req.body.student_id || "";
    var course = req.body.course || "";
    var payment_type = req.body.payment_type || "";
    var amount = req.body.amount || "";

    // formatiraj iznos na dve decimale (string)
    if (amount) {
      var n = Number(amount);
      if (!isNaN(n)) amount = n.toFixed(2);
    }

    var params = new URLSearchParams();
    params.append("billerCode", process.env.PAYWAY_BILLER_CODE); // <= ispravno ime parametra
    params.append("username", process.env.PAYWAY_NET_USERNAME);
    params.append("password", process.env.PAYWAY_NET_PASSWORD);
    params.append("amount", amount);
    params.append("payment_reference", student_id);
    params.append("customer_email", email);
    params.append("return_url", process.env.RETURN_URL);
    params.append("cancel_url", process.env.CANCEL_URL);
    params.append("description", student_name + " | " + course + " | " + payment_type);

    var r = await fetch("https://www.payway.com.au/RequestToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    var text = await r.text();
    if(!r.ok || !looksLikeToken(text)){
      return res.status(400).send("Token error");
    }

    var html = `
      <html>
        <body>
          <form id="payway" action="https://www.payway.com.au/MakePayment" method="POST">
            <input type="hidden" name="cartToken" value="${text}">
          </form>
          <script>document.getElementById('payway').submit()</script>
        </body>
      </html>
    `;
    res.setHeader("Content-Type","text/html; charset=utf-8");
    res.status(200).send(html);
  }catch(e){
    res.status(500).send("Server error");
  }
});

app.post("/payway-notify", function(req, res){
  var secret = req.body.secret || req.body.Secret || "";
  if(secret !== process.env.PAYWAY_WEBHOOK_SECRET){
    return res.status(403).send("Forbidden");
  }
  res.status(200).send("OK");
});

var port = process.env.PORT || 3000;
app.listen(port, function(){});
