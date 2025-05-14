'use client';

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import Link from 'next/link';
import { FileText, Download, Calendar, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface PatientPrescriptionsProps {
  patientId: string;
  patientName: string;
}

export default function PatientPrescriptions({ patientId, patientName }: PatientPrescriptionsProps) {
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPatientPrescriptions();
  }, [patientId]);

  const fetchPatientPrescriptions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('🔵 Fetching prescriptions for patient:', patientId);
      
      // Create query to get prescriptions for this patient
      const prescriptionsQuery = query(
        collection(db, 'prescriptions'),
        where('patientId', '==', patientId)
      );
      
      // Execute query
      const querySnapshot = await getDocs(prescriptionsQuery);
      console.log(`✅ Retrieved ${querySnapshot.docs.length} prescriptions for patient`);
      
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
      
      // Sort by createdAt in descending order (newest first)
      const sortedPrescriptions = prescriptionsList.sort((a, b) => 
        b.createdAt.getTime() - a.createdAt.getTime()
      );
      
      setPrescriptions(sortedPrescriptions);
    } catch (error: any) {
      console.error('❌ Error fetching patient prescriptions:', error);
      setError(`Failed to load prescriptions: ${error.message}`);
      toast.error('Failed to load prescriptions');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="bg-red-50 mb-6">
        <CardContent className="pt-6">
          <p className="text-red-700 mb-2">{error}</p>
          <Button size="sm" onClick={fetchPatientPrescriptions}>Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  if (prescriptions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-gray-500 mb-4">No prescriptions found for this patient.</p>
          <Link href={`/dashboard/doctor/prescriptions`}>
            <Button>Create New Prescription</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Prescription History</h3>
        <Link href={`/dashboard/doctor/prescriptions`}>
          <Button>Create New Prescription</Button>
        </Link>
      </div>
      
      <div className="grid gap-4">
        {prescriptions.map((prescription) => (
          <Card key={prescription.id} className="overflow-hidden hover:shadow-md transition-shadow">
            <CardHeader className="bg-gray-50 pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-base flex items-center">
                    <FileText className="h-4 w-4 mr-2" />
                    Prescription {format(prescription.createdAt, 'dd MMM yyyy')}
                  </CardTitle>
                  <CardDescription className="flex items-center mt-1">
                    <Calendar className="h-3 w-3 mr-1" />
                    {format(prescription.createdAt, 'PPP')}
                    <Clock className="h-3 w-3 ml-3 mr-1" />
                    {format(prescription.createdAt, 'p')}
                  </CardDescription>
                </div>
                
                <div className="flex gap-2">
                  {prescription.downloadUrl && 
                   prescription.downloadUrl !== 'local-only' && 
                   prescription.downloadUrl !== 'preview-only' &&
                   prescription.downloadUrl.startsWith('http') ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="h-8"
                      onClick={() => window.open(prescription.downloadUrl, '_blank')}
                    >
                      <Download className="h-3 w-3 mr-1" /> View PDF
                    </Button>
                  ) : (
                    <Badge variant="outline" className="bg-gray-100">
                      {prescription.downloadUrl === 'preview-only' ? 'Preview Only' : 'Local Only'}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="grid gap-2">
                {prescription.diagnosis && (
                  <div>
                    <p className="text-xs font-medium text-gray-500">Diagnosis</p>
                    <p className="text-sm">{prescription.diagnosis}</p>
                  </div>
                )}
                
                {prescription.medicines && prescription.medicines.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500">Medicines</p>
                    <ul className="text-sm space-y-1">
                      {prescription.medicines.map((med: any, i: number) => (
                        <li key={i} className="flex gap-2">
                          <span className="font-medium">{med.name}</span>
                          <span className="text-gray-500">({med.dosage}, {med.duration})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {prescription.instructions && (
                  <div>
                    <p className="text-xs font-medium text-gray-500">Instructions</p>
                    <p className="text-sm">{prescription.instructions}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
} 