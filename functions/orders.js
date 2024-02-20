require('dotenv').config()
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand
} = require("@aws-sdk/lib-dynamodb");

const ORDERS_TABLE = process.env.ORDERS_TABLE;
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
  try {
    const userId = req.headers.userid; // Extract from headers
    const items = req.body;
    const dateTime = new Date();
    const newDateTime = new Date(dateTime);
    newDateTime.setDate(newDateTime.getDate() + 1);
    const shipDate = newDateTime;

    
    console.log({userId, items})
    // Initialize total cost and total items
    let totalCost = 0;
    let totalItems = 0;
    let orderId;

    // Iterate over the array of items
    items.forEach(item => {
        // Increment total cost by the product of Cost and Quantity
        totalCost += Number(item.cost) * Number(item.quantity);
        // Increment total items by the Quantity
        totalItems += Number(item.quantity);
    });

    
    if (req.query.orderId && req.query.orderId !== null) {
      orderId = req.query.orderId;

      const updateParams = {
          TableName: ORDERS_TABLE,
          Key: {
              userId,
              orderId
          },
          UpdateExpression: 'SET orderDate = :orderDate, shipDate = :shipDate, totalItems = :totalItems, totalCost = :totalCost, #items = :items',
          ProjectionExpression: '#items',
          ExpressionAttributeValues: {
              ':orderDate': dateTime.toISOString(),
              ':shipDate': shipDate.toISOString(),
              ':totalItems': `${totalItems}`,
              ':totalCost': `${totalCost}`,
              ':items': items
          },
          ExpressionAttributeNames: {
            '#items': 'items',
          }
      };
      
      await dynamoDbClient.send(new UpdateCommand(updateParams));
    } else {
      orderId = dateTime.getTime()

      const orderParams = {
        TableName: ORDERS_TABLE,
        ConditionExpression: 'attribute_not_exists(orderId)',
        Item: {
          userId,
          orderId: `${orderId}`,
          orderDate: dateTime.toISOString(),
          shipDate: shipDate.toISOString(),
          totalItems: `${totalItems}`,
          totalCost: `${totalCost}`,
          items
        },
      };
      
      await dynamoDbClient.send(new PutCommand(orderParams))
    }

    res.status(200).json({ userId, orderId });
  } catch (error) {
    console.error("Unable to create order:", error);
    res.status(500).json({ message: 'Failed to create order', error });
  }
}

const getOrderList = async (req, res) => {
  const limit = Number(req.query.limit) || 100;
  let lastEvaluatedKey;
  const userId = req.headers.userid;

  if (req.query.nextPageToken && req.query.nextPageToken !== null) {
    lastEvaluatedKey = JSON.parse(Buffer.from(req.query.nextPageToken, 'base64'));
  }

  const params = new QueryCommand({
    TableName: ORDERS_TABLE,
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
  const { orderId } = req.params;
  const userId = req.headers.userid;
  
  const params = new QueryCommand({
    TableName: ORDERS_TABLE,
    KeyConditionExpression: 'userId = :userId AND orderId = :orderId',
    ExpressionAttributeValues: {
      ':userId': userId,
      ':orderId': orderId
    },
    ProjectionExpression: '#orderId, #orderDate, #shipDate, #totalItems, #totalCost, #items',
    ExpressionAttributeNames: {
      '#orderId': 'orderId',
      '#orderDate': 'orderDate',
      '#shipDate': 'shipDate',
      '#totalItems': 'totalItems',
      '#totalCost': 'totalCost',
      '#items': 'items'
    },
  });

  const data = await dynamoDbClient.send(params);

  console.log(data.Items)
  
  return {
    userId,
    orders: data.Items,
  };
}

module.exports = {
  createUpdateOrder,
  getOrderList,
  getOrderById
}