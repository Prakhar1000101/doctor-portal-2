'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  User, 
  Calendar,
  FileText,
  Phone,
  Mail,
  Clock,
  ExternalLink,
  Download,
  X
} from 'lucide-react';
import { auth, db } from '@/lib/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { getUserRole } from '@/lib/firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";

type Patient = {
  id: string;
  name: string;
  age?: number;
  gender?: string;
  phone?: string;
  email?: string;
};

type Appointment = {
  id: string;
  date: Date;
  time: string;
  reason: string;
  status: string;
  notes?: string;
  prescription?: string;
  doctorId: string;
  patientId: string;
  patientName: string;
};

type Prescription = {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  diagnosis: string;
  complaint?: string;
  investigation?: string;
  treatment?: string;
  medicines: Array<{
    name: string;
    dosage: string;
    duration: string;
  }>;
  instructions?: string;
  fileName: string;
  downloadUrl: string;
  nextVisit?: string;
  notes?: string;
  createdAt: Date;
};

export default function PatientDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [showAllPrescriptions, setShowAllPrescriptions] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [stats, setStats] = useState({
    totalVisits: 0,
    completedVisits: 0,
    upcomingVisits: 0,
    lastVisit: null as string | null
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/auth/signin');
        return;
      }

      try {
        const role = await getUserRole(user.uid);
        if (role !== 'doctor') {
          toast.error('You do not have access to this page');
          router.push('/auth/role-selection');
          return;
        }

        await fetchPatientData();
      } catch (error) {
        console.error('Error verifying role:', error);
        toast.error('Error verifying permissions');
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router, params.id]);

  const fetchPatientData = async () => {
    try {
      setIsLoading(true);
      console.log('Fetching data for patient ID:', params.id);
      
      // Get patient data
      const patientDoc = await getDoc(doc(db, 'patients', params.id));
      
      if (!patientDoc.exists()) {
        toast.error('Patient not found');
        return;
      }
      
      const patientData = {
        id: patientDoc.id,
        ...patientDoc.data()
      } as Patient;
      
      console.log('Patient data:', patientData);
      setPatient(patientData);
      
      // Get appointments
      console.log('Fetching appointments for patient:', params.id);
      const appointmentsQuery = query(
        collection(db, 'appointments'),
        where('patientId', '==', params.id)
      );
      
      const appointmentsSnapshot = await getDocs(appointmentsQuery);
      console.log('Found appointments:', appointmentsSnapshot.size);
      
      const appointmentsData = appointmentsSnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('Raw appointment data:', data);
        return {
          id: doc.id,
          ...data,
          date: data.date?.toDate?.() || new Date(data.date),
        };
      }) as Appointment[];

      console.log('Processed appointments:', appointmentsData);

      // Get prescriptions for this patient
      console.log('Fetching prescriptions for patient:', params.id);
      const prescriptionsQuery = query(
        collection(db, 'prescriptions'),
        where('patientId', '==', params.id)
      );
      
      const prescriptionsSnapshot = await getDocs(prescriptionsQuery);
      console.log('Found prescriptions:', prescriptionsSnapshot.size);
      
      const prescriptionsData = prescriptionsSnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('Raw prescription data:', data);
        
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
          createdAt
        };
      }) as Prescription[];
      
      // Sort prescriptions by date (newest first)
      prescriptionsData.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      console.log('Processed prescriptions:', prescriptionsData);
      setPrescriptions(prescriptionsData);

      // Calculate stats
      const now = new Date();
      const completed = appointmentsData.filter(apt => apt.status === 'completed');
      const upcoming = appointmentsData.filter(apt => {
        const aptDate = apt.date instanceof Date ? apt.date : new Date(apt.date);
        return aptDate > now && apt.status !== 'cancelled';
      });

      const lastVisit = completed.length > 0 
        ? format(new Date(completed[0].date), 'MMM d, yyyy')
        : null;

      const statsData = {
        totalVisits: appointmentsData.length,
        completedVisits: completed.length,
        upcomingVisits: upcoming.length,
        lastVisit
      };
      
      console.log('Setting stats:', statsData);
      setStats(statsData);
      
      console.log('Setting appointments:', appointmentsData);
      setAppointments(appointmentsData);
    } catch (error) {
      console.error('Error fetching patient data:', error);
      toast.error('Failed to load patient data');
    } finally {
      setIsLoading(false);
    }
  };

  const openPrescriptionDetails = (prescription: Prescription) => {
    setSelectedPrescription(prescription);
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="container mx-auto pt-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Patient Not Found</h1>
        <p className="mb-6">The patient you are looking for does not exist or may have been removed.</p>
        <Link href="/dashboard/doctor/patients">
          <Button>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to All Patients
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto pt-8 pb-16">
      {/* Header */}
      <div className="mb-8">
        <Link href="/dashboard/doctor/patients" className="inline-flex items-center text-sm text-gray-500 hover:text-primary mb-4">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to All Patients
        </Link>
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h1 className="text-3xl font-bold">{patient.name}</h1>
            <p className="text-gray-500 mt-1">
              {patient.age ? `${patient.age} years old` : 'Age not specified'}
              {patient.gender ? ` • ${patient.gender}` : ''}
            </p>
          </div>
          
          <div className="mt-4 md:mt-0 flex flex-wrap gap-2">
            {stats.upcomingVisits > 0 && (
              <Badge variant="secondary" className="text-blue-600 bg-blue-100">
                {stats.upcomingVisits} Upcoming Visit{stats.upcomingVisits !== 1 ? 's' : ''}
              </Badge>
            )}
            <Badge variant="secondary">
              {stats.completedVisits} Completed Visit{stats.completedVisits !== 1 ? 's' : ''}
            </Badge>
            {prescriptions.length > 0 && (
              <Badge variant="secondary" className="text-green-600 bg-green-100">
                {prescriptions.length} Prescription{prescriptions.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Patient Information */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Patient Information</CardTitle>
          <CardDescription>Basic details and contact information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="font-medium">Contact Information</h3>
              <div className="space-y-3">
                {patient.phone && (
                  <div className="flex items-center text-sm">
                    <Phone className="h-4 w-4 mr-2 text-gray-500" />
                    <span>{patient.phone}</span>
                  </div>
                )}
                {patient.email && (
                  <div className="flex items-center text-sm">
                    <Mail className="h-4 w-4 mr-2 text-gray-500" />
                    <span>{patient.email}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Visit History */}
            <div className="space-y-4">
              <h3 className="font-medium">Visit History</h3>
              <div className="space-y-3">
                <div className="flex items-center text-sm">
                  <Clock className="h-4 w-4 mr-2 text-gray-500" />
                  <span>
                    Last Visit: {stats.lastVisit || 'No visits yet'}
                  </span>
                </div>
                <div className="flex items-center text-sm">
                  <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                  <span>
                    Total Visits: {stats.totalVisits}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prescription History with View All Button */}
      {prescriptions.length > 0 && (
        <Card className="mb-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Prescription History</CardTitle>
              <CardDescription>Recent prescriptions for this patient</CardDescription>
            </div>
            <Button 
              variant="outline" 
              onClick={() => setShowAllPrescriptions(true)}
              className="flex items-center gap-1"
            >
              <FileText className="h-4 w-4 mr-1" />
              View All Prescriptions
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Show only the most recent 2 prescriptions */}
              {prescriptions.slice(0, 2).map((prescription) => (
                <div key={prescription.id} className="border rounded-md overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 flex justify-between items-center">
                    <div>
                      <h3 className="font-medium">
                        {format(prescription.createdAt, 'PPP')}
                      </h3>
                      <p className="text-sm text-gray-500">Dr. {prescription.doctorName}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => openPrescriptionDetails(prescription)}
                      >
                        View Details
                      </Button>
                      {prescription.downloadUrl && 
                       prescription.downloadUrl !== 'local-only' && 
                       prescription.downloadUrl !== 'preview-only' &&
                       prescription.downloadUrl.startsWith('http') ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => window.open(prescription.downloadUrl, '_blank')}
                          className="flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled>
                          <Download className="h-3 w-3" />
                          {prescription.downloadUrl === 'preview-only' ? ' Preview' : ''}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="p-4">
                    {prescription.diagnosis && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Diagnosis</h4>
                        <p className="mt-1">{prescription.diagnosis}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {prescriptions.length > 2 && (
                <div className="text-center pt-2">
                  <Button 
                    variant="ghost" 
                    onClick={() => setShowAllPrescriptions(true)}
                  >
                    Show {prescriptions.length - 2} more prescription{prescriptions.length - 2 !== 1 ? 's' : ''}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Prescriptions Modal */}
      <Dialog open={showAllPrescriptions} onOpenChange={setShowAllPrescriptions}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>All Prescriptions for {patient?.name}</DialogTitle>
            <DialogDescription>
              Complete prescription history ({prescriptions.length} total)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 my-4">
            {prescriptions.map((prescription) => (
              <div key={prescription.id} className="border rounded-md overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 flex justify-between items-center">
                  <div>
                    <h3 className="font-medium">
                      {format(prescription.createdAt, 'PPP')}
                    </h3>
                    <p className="text-sm text-gray-500">Dr. {prescription.doctorName}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => openPrescriptionDetails(prescription)}
                    >
                      View Details
                    </Button>
                    {prescription.downloadUrl && 
                     prescription.downloadUrl !== 'local-only' && 
                     prescription.downloadUrl !== 'preview-only' &&
                     prescription.downloadUrl.startsWith('http') ? (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => window.open(prescription.downloadUrl, '_blank')}
                        className="flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        <Download className="h-3 w-3" />
                        {prescription.downloadUrl === 'preview-only' ? ' Preview' : ''}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {prescription.diagnosis && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Diagnosis</h4>
                        <p className="mt-1">{prescription.diagnosis}</p>
                      </div>
                    )}
                    
                    {prescription.complaint && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Complaint</h4>
                        <p className="mt-1">{prescription.complaint}</p>
                      </div>
                    )}
                  </div>
                  
                  {prescription.medicines && prescription.medicines.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-500">Medications</h4>
                      <ul className="mt-1 space-y-1">
                        {prescription.medicines.map((medicine, index) => (
                          <li key={index} className="text-sm">
                            <span className="font-medium">{medicine.name}</span>
                            {medicine.dosage && <span> - {medicine.dosage}</span>}
                            {medicine.duration && <span> - {medicine.duration}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <DialogFooter>
            <Button onClick={() => setShowAllPrescriptions(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Prescription Details Modal */}
      <Dialog open={!!selectedPrescription} onOpenChange={(open) => !open && setSelectedPrescription(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Prescription Details</DialogTitle>
            <DialogDescription>
              {selectedPrescription && format(selectedPrescription.createdAt, 'PPP')}
            </DialogDescription>
          </DialogHeader>
          
          {selectedPrescription && (
            <div className="space-y-4 my-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium mb-1">{selectedPrescription.patientName}</h3>
                  <p className="text-sm text-gray-500">Dr. {selectedPrescription.doctorName}</p>
                </div>
                {selectedPrescription.downloadUrl && 
                 selectedPrescription.downloadUrl !== 'local-only' && 
                 selectedPrescription.downloadUrl !== 'preview-only' &&
                 selectedPrescription.downloadUrl.startsWith('http') ? (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => window.open(selectedPrescription.downloadUrl, '_blank')}
                    className="flex items-center gap-1"
                  >
                    View PDF <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    {selectedPrescription.downloadUrl === 'preview-only' ? 'Preview Only' : 'Local Only'}
                  </Button>
                )}
              </div>
              
              <Separator />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedPrescription.diagnosis && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Diagnosis</h4>
                    <p className="mt-1">{selectedPrescription.diagnosis}</p>
                  </div>
                )}
                
                {selectedPrescription.complaint && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Complaint</h4>
                    <p className="mt-1">{selectedPrescription.complaint}</p>
                  </div>
                )}
                
                {selectedPrescription.investigation && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Investigation</h4>
                    <p className="mt-1">{selectedPrescription.investigation}</p>
                  </div>
                )}
                
                {selectedPrescription.treatment && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Treatment</h4>
                    <p className="mt-1">{selectedPrescription.treatment}</p>
                  </div>
                )}
              </div>
              
              {selectedPrescription.medicines && selectedPrescription.medicines.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">Medications</h4>
                  <div className="bg-gray-50 rounded-md p-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium">Medicine</th>
                          <th className="text-left py-2 font-medium">Dosage</th>
                          <th className="text-left py-2 font-medium">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPrescription.medicines.map((medicine, index) => (
                          <tr key={index} className={index !== selectedPrescription.medicines.length - 1 ? "border-b" : ""}>
                            <td className="py-2">{medicine.name}</td>
                            <td className="py-2">{medicine.dosage || 'N/A'}</td>
                            <td className="py-2">{medicine.duration || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              {selectedPrescription.instructions && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Instructions</h4>
                  <p className="mt-1 text-sm">{selectedPrescription.instructions}</p>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedPrescription.nextVisit && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Next Visit</h4>
                    <p className="mt-1 text-sm">
                      {new Date(selectedPrescription.nextVisit).toLocaleDateString()}
                    </p>
                  </div>
                )}
                
                {selectedPrescription.notes && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Doctor's Notes</h4>
                    <p className="mt-1 text-sm">{selectedPrescription.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => setSelectedPrescription(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appointments History */}
      <Card>
        <CardHeader>
          <CardTitle>Appointment History</CardTitle>
          <CardDescription>Past and upcoming appointments</CardDescription>
        </CardHeader>
        <CardContent>
          {appointments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Date</th>
                    <th className="text-left py-3 px-4">Time</th>
                    <th className="text-left py-3 px-4">Reason</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((appointment) => (
                    <tr key={appointment.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        {format(new Date(appointment.date), 'MMM d, yyyy')}
                      </td>
                      <td className="py-3 px-4">{appointment.time}</td>
                      <td className="py-3 px-4">{appointment.reason}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs uppercase font-semibold ${
                            appointment.status === 'completed' ? 'bg-green-100 text-green-800' :
                            appointment.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                            appointment.status === 'checked-in' ? 'bg-blue-100 text-blue-800' :
                            appointment.status === 'in-progress' ? 'bg-purple-100 text-purple-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {appointment.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link href={`/dashboard/doctor/appointments/${appointment.id}`}>
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No appointments found for this patient</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 