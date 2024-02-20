require('dotenv').config()
const express = require("express");
const serverless = require("serverless-http");
const { 
  createUpdateOrder,
  getOrderList,
  getOrderById,
} = require('./functions/orders');

const app = express();

app.use(express.json());

const endpoint = process.env.IS_OFFLINE ? 'http://localhost:3000' : `https://${process.env.REST_API_ID}.execute-api.${process.env.AWS_REGION}.amazonaws.com`

//Orders endpoint

app.put("/order/create", createUpdateOrder)

app.get("/order/list", async (req, res) => {
  try {
    const { userId, orders, lastEvaluatedKey, limit } = await getOrderList(req, res); // Get orders and token

    res.status(200).json({userId, orders, next_url: endpoint + `/order/list?limit=${limit}&nextPageToken=` + lastEvaluatedKey});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not retrieve your home feed" });
  }
})

app.get("/order/:orderId", async (req, res) => {
  try {
    const { userId, orders } = await getOrderById(req, res); // Get single order

    res.status(200).json({userId, orders});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not retrieve your friend's feed" });
  }
})

app.use((req, res, next) => {
  return res.status(404).json({
    error: "Not Found",
  });
});


module.exports.handler = serverless(app);
