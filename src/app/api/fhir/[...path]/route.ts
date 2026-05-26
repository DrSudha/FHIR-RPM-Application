import { NextRequest, NextResponse } from 'next/server';
import { verifySessionFromRequest } from '@/lib/auth/dal';

async function handleProxy(
  request: NextRequest,
  paramsPromise: Promise<{ path: string[] }>
) {
  try {
    const session = await verifySessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { path } = await paramsPromise;
    const fhirBaseUrl = process.env.FHIR_BASE_URL;
    
    if (!fhirBaseUrl) {
      return NextResponse.json(
        { error: 'FHIR_BASE_URL is not configured on the server.' },
        { status: 500 }
      );
    }

    const targetPath = path.join('/');
    const searchParams = new URL(request.url).search;
    const targetUrl = `${fhirBaseUrl}/${targetPath}${searchParams}`;

    // Get auth token
    const token = process.env.FHIR_AUTH_TOKEN;
    const headers = new Headers();
    
    // Set headers
    headers.set('Accept', 'application/fhir+json, application/json');
    
    const requestContentType = request.headers.get('content-type');
    if (requestContentType) {
      headers.set('Content-Type', requestContentType);
    } else if (request.method === 'POST' || request.method === 'PUT') {
      headers.set('Content-Type', 'application/fhir+json');
    }

    if (token && token.trim() !== '') {
      headers.set('Authorization', `Bearer ${token.trim()}`);
    }

    // Get body if applicable
    let body: any = undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.text();
    }

    console.log(`[FHIR Proxy] Forwarding ${request.method} to: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });

    const textData = await response.text();
    let data;

    try {
      if (textData) {
        data = JSON.parse(textData);
      } else {
        data = { status: response.status, statusText: response.statusText };
      }
    } catch (e) {
      data = textData; // fallback to raw text if not JSON
    }

    // If it's a success but server returned an OperationOutcome with errors
    if (!response.ok) {
      console.error(`[FHIR Proxy Server Error] Code ${response.status}:`, data);
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error('[FHIR Proxy Error]:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred in the proxy.' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, params);
}
