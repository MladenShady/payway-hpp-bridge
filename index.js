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

app.get("/ip", async function(req, res){
  try{
    var r = await fetch("https://api.ipify.org");
    var ip = await r.text();
    res.status(200).send(ip);
  }catch(e){
    res.status(500).send("IP error");
  }
});

function fmtAmount(a){
  var n = Number(a);
  if (isNaN(n) || n <= 0) return "";
  return n.toFixed(2);
}

function looksLikeToken(s){
  return typeof s === "string" && s.length >= 20 && /^[A-Za-z0-9\-_]+$/.test(s);
}

app.post("/_dryrun", function(req, res){
  var student_name = req.body.student_name || "";
  var email = req.body.email || "";
  var student_id = req.body.student_id || "";
  var course = req.body.course || "";
  var payment_type = req.body.payment_type || "";
  var amount = fmtAmount(req.body.amount);
  var desc = [student_name, course, payment_type].filter(Boolean).join(" | ");

  res.status(200).json({
    biller_code: String(process.env.PAYWAY_BILLER_CODE || "").trim(),
    username: String(process.env.PAYWAY_NET_USERNAME || "").trim(),
    amount,
    payment_reference: student_id || "",
    customer_email: email || "",
    return_url: String(process.env.RETURN_URL || "").trim(),
    description: desc || ""
  });
});

app.post("/initiate-payment", async function(req, res){
  try{
    var student_name = req.body.student_name || "";
    var email = req.body.email || "";
    var student_id = req.body.student_id || "";
    var course = req.body.course || "";
    var payment_type = req.body.payment_type || "";
    var amount = fmtAmount(req.body.amount);

    if(!amount){
      res.status(400).json({ message: "Invalid amount", amount_raw: req.body.amount });
      return;
    }

    var params = new URLSearchParams();
    params.append("biller_code", (process.env.PAYWAY_BILLER_CODE || "").trim());
    params.append("username", (process.env.PAYWAY_NET_USERNAME || "").trim());
    params.append("password", (process.env.PAYWAY_NET_PASSWORD || "").trim());
    params.append("amount", amount);
    if (student_id) params.append("payment_reference", student_id);
    if (email) params.append("customer_email", email);
    if (process.env.RETURN_URL) params.append("return_url", (process.env.RETURN_URL || "").trim());
    var desc = [student_name, course, payment_type].filter(Boolean).join(" | ");
    if (desc) params.append("description", desc);

    var controller = new AbortController();
    var to = setTimeout(function(){ controller.abort(); }, 15000);

    var r = await fetch("https://www.payway.com.au/RequestToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "text/plain" },
      body: params.toString(),
      signal: controller.signal
    }).catch(function(err){ throw err; });

    clearTimeout(to);

    var text = "";
    var status = 0;
    var headersObj = {};
    if (r) {
      status = r.status;
      r.headers.forEach(function(v, k){ headersObj[k] = v; });
      text = await r.text();
    }

    if(!r || !r.ok || !looksLikeToken(text)){
      var ipResp = "";
      try{
        var ipR = await fetch("https://api.ipify.org");
        ipResp = await ipR.text();
      }catch(e){}

      res.status(400).json({
        message: "Token request failed",
        payway_status: status,
        payway_headers: headersObj,
        payway_body: text || "",
        our_egress_ip: ipResp || "",
        sent_fields: {
          biller_code: (process.env.PAYWAY_BILLER_CODE || "").trim(),
          username: (process.env.PAYWAY_NET_USERNAME || "").trim(),
          amount,
          payment_reference: student_id || "",
          customer_email: email || "",
          return_url: (process.env.RETURN_URL || "").trim(),
          description: desc || ""
        }
      });
      return;
    }

    var html = "<html><body><form id='payway' action='https://www.payway.com.au/MakePayment' method='POST'><input type='hidden' name='cartToken' value='" + text + "'></form><script>document.getElementById('payway').submit()</script></body></html>";
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
