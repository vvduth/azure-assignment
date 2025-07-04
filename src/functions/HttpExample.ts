import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function HttpExample(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    const name = request.query.get('name') || await request.text() || 'world';

    return { body: `Hello, ${name}, duke!` };
};

app.http('HttpExample', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: HttpExample
});
