'use client';

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function PrescriptionHistory() {
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPrescriptions();
  }, []);

  const fetchPrescriptions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('🔵 Fetching prescriptions from Firestore...');
      
      // Create query to get all prescriptions (don't order by createdAt since it's now stored as string)
      const prescriptionsQuery = query(
        collection(db, 'prescriptions')
      );
      
      // Execute query
      const querySnapshot = await getDocs(prescriptionsQuery);
      console.log(`✅ Retrieved ${querySnapshot.docs.length} prescriptions`);
      
      // Process results
      const prescriptionsList = querySnapshot.docs.map(doc => {
        const data = doc.data();
        try {
          // Handle different createdAt formats
          let createdAt;
          if (data.createdAt) {
            if (typeof data.createdAt === 'string') {
              createdAt = new Date(data.createdAt);
            } else if (data.createdAt.toDate) {
              createdAt = data.createdAt.toDate();
            } else {
              createdAt = new Date();
            }
          } else {
            createdAt = new Date();
          }
          
          return {
            id: doc.id,
            ...data,
            createdAt: createdAt
          };
        } catch (err) {
          console.error('Error parsing prescription date:', err);
          return {
            id: doc.id,
            ...data,
            createdAt: new Date()
          };
        }
      });
      
      // Sort manually by createdAt in descending order (newest first)
      const sortedPrescriptions = prescriptionsList.sort((a, b) => 
        b.createdAt.getTime() - a.createdAt.getTime()
      );
      
      setPrescriptions(sortedPrescriptions);
      console.log('Processed prescriptions:', sortedPrescriptions);
    } catch (error: any) {
      console.error('❌ Error fetching prescriptions:', error);
      setError(`Failed to load prescriptions: ${error.message}`);
      toast.error('Failed to load prescriptions');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto pt-8 pb-16">
        <Card className="bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">Error Loading Prescriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700 mb-4">{error}</p>
            <Button
              className="mt-4"
              onClick={fetchPrescriptions}
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto pt-8 pb-16">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Prescription History</h1>
          <p className="text-gray-500 mt-1">View all prescriptions</p>
        </div>
        <Button onClick={fetchPrescriptions}>Refresh</Button>
      </div>

      {prescriptions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500 mb-4">No prescriptions found in the database.</p>
            <p className="text-sm text-gray-400">Try generating a prescription first.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {prescriptions.map((prescription) => (
            <Card key={prescription.id} className="overflow-hidden">
              <CardHeader className="bg-gray-50 pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="mb-1">{prescription.patientName}</CardTitle>
                    <CardDescription>
                      {format(prescription.createdAt, 'PPP')} at {format(prescription.createdAt, 'p')}
                    </CardDescription>
                  </div>
                  <div className="bg-white px-3 py-1 rounded text-sm border">
                    ID: {prescription.id.substring(0, 8)}...
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Diagnosis</p>
                    <p>{prescription.diagnosis}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Medicines</p>
                    <ul className="list-disc list-inside">
                      {prescription.medicines?.map((med: any, i: number) => (
                        <li key={i}>{med.name} - {med.dosage} - {med.duration}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex gap-3 mt-3">
                    {prescription.downloadUrl && 
                     prescription.downloadUrl !== 'local-only' && 
                     prescription.downloadUrl !== 'preview-only' &&
                     prescription.downloadUrl.startsWith('http') ? (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => window.open(prescription.downloadUrl, '_blank')}
                      >
                        View on Drive
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        {prescription.downloadUrl === 'preview-only' ? 'Preview Only' : 'Local Only'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
} 