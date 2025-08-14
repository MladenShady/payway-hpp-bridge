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

function fmtAmount(a){
  var n = Number(a);
  if (isNaN(n) || n <= 0) return "";
  return n.toFixed(2);
}

function looksLikeToken(s){
  return typeof s === "string" && s.length >= 20 && /^[A-Za-z0-9\-_]+$/.test(s);
}

app.post("/initiate-payment", async function(req, res){
  try{
    var student_name = req.body.student_name || "";
    var email = req.body.email || "";
    var student_id = req.body.student_id || "";
    var course = req.body.course || "";
    var payment_type = req.body.payment_type || "";
    var amount = fmtAmount(req.body.amount);

    var params = new URLSearchParams();
    params.append("biller_code", process.env.PAYWAY_BILLER_CODE);
    params.append("merchant_id", process.env.PAYWAY_MERCHANT_ID);
    params.append("username", process.env.PAYWAY_NET_USERNAME);
    params.append("password", process.env.PAYWAY_NET_PASSWORD);
    params.append("amount", amount);
    params.append("payment_reference", student_id);
    params.append("customer_email", email);
    params.append("return_url", process.env.RETURN_URL);
    params.append("description", student_name + " | " + course + " | " + payment_type);

    var r = await fetch("https://www.payway.com.au/RequestToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    var text = await r.text();

    if(!r.ok || !looksLikeToken(text)){
      res.status(400).send(text || "Token error");
      return;
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
  res.status(200).send("OK");
});

var port = process.env.PORT || 3000;
app.listen(port, function(){});
