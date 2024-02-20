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

app.put("/users/:actor/activities", createUpdateOrder)

app.get("/order/list", async (req, res) => {
  try {
    const { activities, lastEvaluatedKey, limit } = await getOrderList(req, res); // Get orders and token

    res.status(200).json({my_feed: activities, next_url: endpoint + `/my_feed?limit=${limit}&nextPageToken=` + lastEvaluatedKey});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not retrieve your home feed" });
  }
})

app.get("/order/:orderId", async (req, res) => {
  try {
    const { activities, lastEvaluatedKey, limit } = await getOrderById(req, res); // Get single order

    res.status(200).json({friends_feed: activities, next_url: endpoint + `/users/:actor/following?limit=${limit}&nextPageToken=` + lastEvaluatedKey});
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
