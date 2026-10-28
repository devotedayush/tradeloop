import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
class TradeLoopStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);
    const table = new dynamodb.Table(this, "Records", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    const bucket = new s3.Bucket(this, "Evidence", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        { prefix: "demofoods/incoming/", expiration: cdk.Duration.days(1) },
      ],
    });
    const pool = new cognito.UserPool(this, "Staff", {
      selfSignUpEnabled: false,
      signInAliases: { username: true },
      passwordPolicy: {
        minLength: 14,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const client = pool.addClient("Dashboard", {
      authFlows: { userPassword: true },
      preventUserExistenceErrors: true,
      idTokenValidity: cdk.Duration.hours(1),
    });
    const env: Record<string, string> = {
      TABLE_NAME: table.tableName,
      EVIDENCE_BUCKET: bucket.bucketName,
      USER_POOL_ID: pool.userPoolId,
      USER_POOL_CLIENT_ID: client.userPoolClientId,
      BEDROCK_REGION: this.region,
      STATIC_DIR: "/var/task/dist",
      TENANT_IDS: "demofoods",
    };
    for (const key of [
      "BEDROCK_MODEL_ID",
      "WHATSAPP_PHONE_ID",
      "WHATSAPP_META_PHONE_ID",
      "WHATSAPP_REGION",
      "WHATSAPP_MEDIA_BUCKET",
      "CONTACT_BINDINGS_JSON",
      "FOLLOWUP_TEMPLATE",
      "SERVICE_TEMPLATE",
      "TEMPLATE_LANGUAGE",
      "META_API_VERSION",
      "SES_FROM",
      "SES_TO",
    ])
      if (process.env[key]) env[key] = process.env[key]!;
    const make = (name: string, handler: string, timeout = 29) => {
      const logGroup = new logs.LogGroup(this, name + "Logs", {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
      const fn = new lambda.Function(this, name, {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler,
        code: lambda.Code.fromAsset("build"),
        timeout: cdk.Duration.seconds(timeout),
        memorySize: 512,
        environment: env,
        logGroup,
      });
      return fn;
    };
    const apiFn = make("DashboardApi", "http.handler");
    const worker = make("ConversationWorker", "messaging.worker", 90);
    const ingest = make("InboundEvents", "messaging.ingest", 30);
    const sender = make("OutboundMessages", "messaging.sender", 60);
    for (const fn of [apiFn, worker, sender]) table.grantReadWriteData(fn);
    for (const fn of [apiFn, worker]) {
      bucket.grantReadWrite(fn);
      const modelId = env.BEDROCK_MODEL_ID;
      if (modelId) {
        const foundationId = modelId.replace(/^(us|eu|apac|global)\./, "");
        fn.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ["bedrock:InvokeModel"],
            resources: modelId.startsWith("arn:")
              ? [modelId, `arn:${this.partition}:bedrock:*::foundation-model/*`]
              : [
                  `arn:${this.partition}:bedrock:*::foundation-model/${foundationId}`,
                  `arn:${this.partition}:bedrock:*:${this.account}:inference-profile/${modelId}`,
                ],
          }),
        );
      }
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["textract:DetectDocumentText"],
          resources: ["*"],
        }),
      );
    }
    const dlq = new sqs.Queue(this, "DeadLetters", {
      fifo: true,
      retentionPeriod: cdk.Duration.days(7),
    });
    const queue = new sqs.Queue(this, "Conversations", {
      fifo: true,
      visibilityTimeout: cdk.Duration.seconds(540),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
      retentionPeriod: cdk.Duration.days(2),
    });
    ingest.addEnvironment("INBOUND_QUEUE_URL", queue.queueUrl);
    queue.grantSendMessages(ingest);
    worker.addEventSource(
      new sources.SqsEventSource(queue, {
        batchSize: 1,
        reportBatchItemFailures: true,
      }),
    );
    const topic = new sns.Topic(this, "WhatsAppEvents");
    topic.addSubscription(new subscriptions.LambdaSubscription(ingest));
    topic.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [
          new iam.ServicePrincipal("social-messaging.amazonaws.com"),
        ],
        actions: ["sns:Publish"],
        resources: [topic.topicArn],
        conditions: { StringEquals: { "aws:SourceAccount": this.account } },
      }),
    );
    const regionalTopicArn = process.env.WHATSAPP_EVENT_TOPIC_ARN;
    if (regionalTopicArn && regionalTopicArn !== topic.topicArn) {
      const permission = new lambda.CfnPermission(
        this,
        "RegionalWhatsAppPermission",
        {
          action: "lambda:InvokeFunction",
          functionName: ingest.functionArn,
          principal: "sns.amazonaws.com",
          sourceArn: regionalTopicArn,
          sourceAccount: this.account,
        },
      );
      const subscription = new sns.CfnSubscription(
        this,
        "RegionalWhatsAppSubscription",
        {
          topicArn: regionalTopicArn,
          protocol: "lambda",
          endpoint: ingest.functionArn,
          region: regionalTopicArn.split(":")[3],
        },
      );
      subscription.addDependency(permission);
    }
    if (process.env.WHATSAPP_MEDIA_BUCKET) {
      s3.Bucket.fromBucketName(
        this,
        "RegionalWhatsAppMedia",
        process.env.WHATSAPP_MEDIA_BUCKET,
      ).grantReadWrite(worker, "demofoods/incoming/*");
    }
    worker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["social-messaging:GetWhatsAppMessageMedia"],
        resources: ["*"],
      }),
    );
    sender.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["social-messaging:SendWhatsAppMessage"],
        resources: ["*"],
      }),
    );
    new events.Rule(this, "OutboundTick", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new targets.LambdaFunction(sender)],
    });
    const api = new apigw.HttpApi(this, "Dashboard", {
      defaultIntegration: new integrations.HttpLambdaIntegration("App", apiFn),
    });
    new cloudwatch.Alarm(this, "WorkerErrors", {
      metric: worker.metricErrors(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription:
        "Inspect failed conversation processing; no notification recipient configured",
    });
    new cloudwatch.Alarm(this, "DeadLetterAlarm", {
      metric: dlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
    });
    new cdk.CfnOutput(this, "DashboardUrl", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "UserPoolId", { value: pool.userPoolId });
    new cdk.CfnOutput(this, "ClientId", { value: client.userPoolClientId });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
    new cdk.CfnOutput(this, "EvidenceBucket", { value: bucket.bucketName });
    new cdk.CfnOutput(this, "WhatsAppTopicArn", { value: topic.topicArn });
    new cdk.CfnOutput(this, "ActiveWhatsAppTopicArn", {
      value: regionalTopicArn ?? topic.topicArn,
    });
    new cdk.CfnOutput(this, "ApiFunctionName", { value: apiFn.functionName });
    new cdk.CfnOutput(this, "WorkerFunctionName", {
      value: worker.functionName,
    });
  }
}
const app = new cdk.App();
new TradeLoopStack(app, "TradeLoopDemo", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.DEPLOY_REGION ?? "us-east-1",
  },
  description:
    "TradeLoop: synthetic distributor sales and delivery workflow demonstration",
});
