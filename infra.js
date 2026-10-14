const cdk = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const logs = require('aws-cdk-lib/aws-logs');
const cloudwatch = require('aws-cdk-lib/aws-cloudwatch');
const actions = require('aws-cdk-lib/aws-cloudwatch-actions');
const sns = require('aws-cdk-lib/aws-sns');
const iam = require('aws-cdk-lib/aws-iam');

const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const boundaryArn = process.env.MCP_BOUNDARY_POLICY_ARN;
if (!account || !boundaryArn || !/^arn:aws:iam::\d{12}:policy\//.test(boundaryArn) || !boundaryArn.includes(`::${account}:`)) {
  throw new Error('Set CDK_DEFAULT_ACCOUNT and an account-matching MCP_BOUNDARY_POLICY_ARN before synthesis');
}
const stack = new cdk.Stack(app, 'is-agentic-mcp-url', {env: {account, region: process.env.CDK_DEFAULT_REGION || 'us-west-2'}, description: 'Independent read-only Is Agentic Shopify MCP service'});
cdk.Tags.of(stack).add('Service', 'is-agentic-mcp');
const boundary = iam.ManagedPolicy.fromManagedPolicyArn(stack, 'Boundary', boundaryArn);
const role = new iam.Role(stack, 'McpExecutionRole', {roleName: 'is-agentic-mcp-execution', assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'), permissionsBoundary: boundary});
// Retained by the first rolled-back deployment; retention was set to 14 days on the existing group.
const logGroup = logs.LogGroup.fromLogGroupName(stack, 'McpLogs', '/aws/lambda/is-agentic-mcp');
role.addToPolicy(new iam.PolicyStatement({actions: ['logs:CreateLogStream', 'logs:PutLogEvents'], resources: [`arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/lambda/is-agentic-mcp:*`]}));
const fn = new lambda.Function(stack, 'McpFunction', {functionName: 'is-agentic-mcp', runtime: lambda.Runtime.NODEJS_20_X, handler: 'handler.handler', code: lambda.Code.fromAsset('lambda'), role, timeout: cdk.Duration.seconds(10), memorySize: 256, reservedConcurrentExecutions: 5, logGroup});
// The Lambda URL supplies requestContext.http.sourceIp; do not trust caller-supplied forwarding headers.
const url = fn.addFunctionUrl({authType: lambda.FunctionUrlAuthType.NONE, cors: {allowedOrigins: ['*'], allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST], allowedHeaders: ['content-type', 'accept', 'mcp-session-id', 'mcp-protocol-version'], exposedHeaders: ['mcp-session-id']}});
const alarm = new cloudwatch.Alarm(stack, 'Mcp5xxAlarm', {alarmName: 'is-agentic-mcp-5xx', metric: new cloudwatch.Metric({namespace: 'AWS/Lambda', metricName: 'Url5xxCount', dimensionsMap: {FunctionName: fn.functionName}, period: cdk.Duration.minutes(5), statistic: 'Sum'}), threshold: 1, evaluationPeriods: 1, treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING});
const topic = new sns.Topic(stack, 'McpAlarmTopic', {topicName: 'is-agentic-mcp-alarms'});
alarm.addAlarmAction(new actions.SnsAction(topic));
new cdk.CfnOutput(stack, 'McpUrl', {value: `${url.url}mcp`});
// Invocation volume alarm: more than 50k invocations in an hour means something is wrong, alert the same topic.
const volAlarm = new cloudwatch.Alarm(stack, 'McpVolumeAlarm', {alarmName: 'is-agentic-mcp-volume', metric: fn.metricInvocations({period: cdk.Duration.hours(1), statistic: 'Sum'}), threshold: 50000, evaluationPeriods: 1, treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING});
volAlarm.addAlarmAction(new actions.SnsAction(topic));
const thrAlarm = new cloudwatch.Alarm(stack, 'McpThrottleAlarm', {alarmName: 'is-agentic-mcp-throttles', metric: fn.metricThrottles({period: cdk.Duration.minutes(5), statistic: 'Sum'}), threshold: 100, evaluationPeriods: 1, treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING});
thrAlarm.addAlarmAction(new actions.SnsAction(topic));
new cdk.CfnOutput(stack, 'AlarmTopicArn', {value: topic.topicArn});
