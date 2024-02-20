require('dotenv').config()
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand
} = require("@aws-sdk/lib-dynamodb");

const ORDER_TABLE = process.env.ORDER_TABLE;
const translateConfig = {
  marshallOptions: {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  }
};

const dynamoDbClientParams = {};
if (process.env.IS_OFFLINE) {
  dynamoDbClientParams.region = 'localhost'
  dynamoDbClientParams.endpoint = 'http://localhost:8000'
}
const client = new DynamoDBClient(dynamoDbClientParams);
const dynamoDbClient = DynamoDBDocumentClient.from(client, translateConfig);

const createUpdateOrder = async (req, res) => {
  const { userId } = req.params; // Extract path parameters
  const items = req.body;
  const dateTime = new Date();
  
  // Initialize total cost and total items
  let totalCost = 0;
  let totalItems = 0;

  // Iterate over the array of items
  items.forEach(item => {
      // Increment total cost by the product of Cost and Quantity
      totalCost += item.Cost * item.Quantity;
      // Increment total items by the Quantity
      totalItems += item.Quantity;
  });

  const orderId = dateTime.getTime()

  const activityParams = {
    TableName: ORDER_TABLE,
    ConditionExpression: 'attribute_not_exists(orderId)',
    Item: {
      userId,
      orderId,
      orderDate: dateTime.toISOString(),
      shipDate: dateTime.setDate(dateTime.getDate() + 1),
      totalItems,
      totalCost,
      items
    },
  };

  try {

    await dynamoDbClient.send(new PutCommand(activityParams))
    
    res.status(201).json({ userId, orderId });
  } catch (error) {// If the orderId already exists, update the order
    if (error.name === 'ConditionalCheckFailedException') {
        const updateParams = {
            TableName: ORDER_TABLE,
            Key: {
                userId,
                orderId
            },
            UpdateExpression: 'SET orderDate = :orderDate, shipDate = :shipDate, totalItems = :totalItems, totalCost = :totalCost, Items = :items',
            ExpressionAttributeValues: {
                ':orderDate': dateTime.toISOString(),
                ':shipDate': dateTime.setDate(dateTime.getDate() + 1),
                ':totalItems': totalItems,
                ':totalCost': totalCost,
                ':items': items
            }
        };
        
        // Perform the update operation
        try {
            await dynamoDbClient.send(new UpdateCommand(updateParams));
            console.log("Order updated successfully");
            res.status(204).json({ userId, orderId });
        } catch (updateError) {
            console.error("Unable to update order:", updateError);
        }
    } else {
        console.error("Unable to create order:", error);
        res.status(500).json({ message: 'Failed to create order', error });
    }
  }
}

const getOrderList = async (req, res) => {
  const limit = Number(req.query.limit) || 100;
  let lastEvaluatedKey;
  const { userId } = req.params;

  if (req.query.nextPageToken && req.query.nextPageToken !== null) {
    lastEvaluatedKey = JSON.parse(Buffer.from(req.query.nextPageToken, 'base64'));
  }

  const params = new QueryCommand({
    TableName: ORDER_TABLE,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
        ':userId': userId
    },
    ProjectionExpression: '#orderId, #orderDate, #shipDate, #totalItems, #totalCost',
    ExpressionAttributeNames: {
      '#orderId': 'orderId',
      '#orderDate': 'orderDate',
      '#shipDate': 'shipDate',
      '#totalItems': 'totalItems',
      '#totalCost': 'totalCost'
    },
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: lastEvaluatedKey,
  })

  const data = await dynamoDbClient.send(params);
  const nextPage = data.LastEvaluatedKey;

  console.log(data.Items)
  
  return {
    userId,
    orders: data.Items,
    limit,
    lastEvaluatedKey: data.LastEvaluatedKey ? Buffer.from(JSON.stringify(nextPage)).toString('base64') : null
  };
}

const getOrderById = async (req, res) => {
  const { userId, orderId } = req.params;
  
  const params = new QueryCommand({
    TableName: ORDER_TABLE,
    Key: {
      userId,
      orderId
    }
  });

  const data = await dynamoDbClient.send(params);

  console.log(data.Items)
  
  return {
    order: data.Items,
  };
}

module.exports = {
  createUpdateOrder,
  getOrderList,
  getOrderById
}