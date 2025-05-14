'use client';

import React, { useEffect, useState } from 'react';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: any;
      };
    };
  }
}
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { getUserRole } from '@/lib/firebase/auth';
import { getDoctorByUserId } from '@/lib/firebase/doctors';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from 'lucide-react';
import { MedicineAutocomplete } from '@/components/ui/medicine-autocomplete';
import { addMedicine as addMedicineToDb } from '@/lib/firebase/medicines';
import Script from 'next/script';

const GOOGLE_CLIENT_ID = '567124813254-9qr073hto7b3usombl4l91hlfsl9vqes.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyDFsTgXvs5IYs9zkyXFpuAweAi5HJWBvjA';
const REDIRECT_URI = 'http://localhost:3000';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];

type Doctor = {
  id: string;
  userId: string;
  name: string;
  specialization: string;
  email: string;
  phone: string;
};

type Patient = {
  id: string;
  name: string;
  age?: number;
  gender?: string;
  phone?: string;
  email?: string;
};

type Medicine = {
  name: string;
  dosage: string;
  duration: string;
};

// Add type definition for Google Drive upload result
type DriveUploadResult = {
  id: string;
  name: string;
  webViewLink: string | null;
  localOnly: boolean;
  reason?: string;
  error?: string;
};

export default function PrescriptionsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([{ name: '', dosage: '', duration: '' }]);
  const [formData, setFormData] = useState({
    patientName: '',
    patientAge: '',
    patientGender: '',
    complaint: '',
    investigation: '',
    treatment: '',
    diagnosis: '',
    instructions: '',
    nextVisit: '',
    doctorNotes: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [gapiLoaded, setGapiLoaded] = useState(false);
  const [gisLoaded, setGisLoaded] = useState(false);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'preview-only'>('idle');
  const [redirectUri, setRedirectUri] = useState(REDIRECT_URI);
  // Disable Google Drive integration by default
  const [driveEnabled, setDriveEnabled] = useState(false);
  // Add a state for persistent authentication
  const [isPersistentAuth, setIsPersistentAuth] = useState(true);
  // Track if we have a saved token
  const [hasSavedToken, setHasSavedToken] = useState(false);
  // Add a state for local download preference
  const [localDownload, setLocalDownload] = useState(true);

  // Set up the redirect URI once the component is mounted on the client
  useEffect(() => {
    // Now we can safely access window
    setRedirectUri(window.location.origin);
    console.log('🔵 Updated redirect URI to:', window.location.origin);
    
    // Load Drive preference and token from localStorage
    try {
      // Load Drive enabled preference
      const savedDrivePreference = localStorage.getItem('driveEnabled');
      if (savedDrivePreference !== null) {
        setDriveEnabled(savedDrivePreference === 'true');
        console.log('🔵 Loaded Drive preference from localStorage:', savedDrivePreference === 'true');
      }
      
      // Load persistent auth preference
      const savedPersistentAuth = localStorage.getItem('persistentAuth');
      if (savedPersistentAuth !== null) {
        setIsPersistentAuth(savedPersistentAuth === 'true');
        console.log('🔵 Loaded persistent auth preference:', savedPersistentAuth === 'true');
      }
      
      // Load local download preference
      const savedLocalDownload = localStorage.getItem('localDownload');
      if (savedLocalDownload !== null) {
        setLocalDownload(savedLocalDownload === 'true');
        console.log('🔵 Loaded local download preference:', savedLocalDownload === 'true');
      }
      
      // Check if we have a saved access token
      const savedToken = localStorage.getItem('googleDriveToken');
      if (savedToken) {
        console.log('🔵 Found saved Google Drive token');
        setHasSavedToken(true);
      }
    } catch (error) {
      console.warn('⚠️ Could not load preferences from localStorage');
    }
  }, []);
  
  // Save Drive preference to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('driveEnabled', driveEnabled.toString());
      console.log('🔵 Saved Drive preference to localStorage:', driveEnabled);
    } catch (error) {
      console.warn('⚠️ Could not save Drive preference to localStorage');
    }
  }, [driveEnabled]);
  
  // Save persistent auth preference to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('persistentAuth', isPersistentAuth.toString());
      console.log('🔵 Saved persistent auth preference to localStorage:', isPersistentAuth);
    } catch (error) {
      console.warn('⚠️ Could not save persistent auth preference to localStorage');
    }
  }, [isPersistentAuth]);
  
  // Save local download preference to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('localDownload', localDownload.toString());
      console.log('🔵 Saved local download preference to localStorage:', localDownload);
    } catch (error) {
      console.warn('⚠️ Could not save local download preference to localStorage');
    }
  }, [localDownload]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/auth/signin');
        return;
      }

      try {
        setError(null);
        const role = await getUserRole(user.uid);
        if (role !== 'doctor') {
          toast.error('You do not have access to this page');
          router.push('/auth/role-selection');
          return;
        }

        // Store user email in sessionStorage for easy reference in OAuth setup
        if (typeof window !== 'undefined' && user.email) {
          window.sessionStorage.setItem('userEmail', user.email);
        }

        // Get doctor info
        const doctorInfo = await getDoctorByUserId(user.uid);
        if (doctorInfo && doctorInfo.id) {
          setDoctor(doctorInfo as Doctor);
        }

        // Display warning about Drive integration if Google APIs fail
        // Only check on client side
        if (typeof window !== 'undefined' && (!window.google || !window.gapi)) {
          toast.warning('Google Drive integration may not be available', {
            description: 'PDFs will be saved locally only',
            duration: 5000
          });
        }

        // Fetch patients list
        console.log('Fetching patients...');
        const patientsQuery = query(
          collection(db, 'patients'),
          orderBy('name', 'asc')
        );

        const patientsSnapshot = await getDocs(patientsQuery);
        console.log('Found patients:', patientsSnapshot.size);

        const patientsData = patientsSnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || doc.data().fullName || 'Unknown',
          age: doc.data().age,
          gender: doc.data().gender,
          phone: doc.data().phone,
          email: doc.data().email,
        }));

        console.log('Processed patients data:', patientsData);
        setPatients(patientsData);
      } catch (error: any) {
        console.error('Error:', error);
        let errorMessage = 'Error loading data';

        if (error.code === 'failed-precondition' ||
          error.message?.includes('ERR_BLOCKED_BY_CLIENT') ||
          error.message?.includes('failed to fetch')) {
          errorMessage = 'Unable to connect to the database. This might be caused by an ad blocker or firewall. Please try:';
          setError(errorMessage);
        } else {
          toast.error(errorMessage);
        }
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Initialize Google API
  useEffect(() => {
    const gapiScriptId = 'gapi-script';
    const gisScriptId = 'gis-script';

    // Only run on client-side
    if (typeof window === 'undefined') {
      console.log('🟡 Skipping Google API initialization on server side');
      return;
    }

    // Only load scripts if they don't exist yet
    if (!document.getElementById(gapiScriptId)) {
      const script1 = document.createElement('script');
      script1.src = 'https://apis.google.com/js/api.js';
      script1.id = gapiScriptId;
      script1.async = true;
      script1.defer = true;
      script1.onload = () => initializeGapiClient();
      document.body.appendChild(script1);
    } else {
      if (window.gapi) initializeGapiClient();
    }

    if (!document.getElementById(gisScriptId)) {
      const script2 = document.createElement('script');
      script2.src = 'https://accounts.google.com/gsi/client';
      script2.id = gisScriptId;
      script2.async = true;
      script2.defer = true;
      script2.onload = () => initializeGisClient();
      document.body.appendChild(script2);
    } else {
      if (window.google?.accounts?.oauth2) initializeGisClient();
    }

    function initializeGapiClient() {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            discoveryDocs: DISCOVERY_DOCS,
          });
          console.log('GAPI client initialized');
          setGapiLoaded(true);
        } catch (error) {
          console.error('Error initializing GAPI client:', error);
          toast.error('Failed to initialize Google API client');
        }
      });
    }

    function initializeGisClient() {
      try {
        console.log('🔵 Initializing Google Identity Services OAuth client');
        console.log('🔵 Using redirect URI:', redirectUri);
        
        if (!window.google?.accounts?.oauth2) {
          console.error('❌ Google OAuth2 client not available');
          return;
        }
        
        const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
          // Use explicit localhost URI as shown in the error message
          redirect_uri: 'http://localhost:3000',
          // Use a popup flow instead of redirect to avoid URI issues
          ux_mode: 'popup',
          // Don't include extra parameters that could cause issues
          state: '',
          // Use popup instead of redirect flow
        callback: (tokenResponse: any) => {
          if (tokenResponse && tokenResponse.access_token) {
              console.log('✅ Google OAuth token acquired successfully');
            } else if (tokenResponse.error) {
              console.error('❌ OAuth error:', tokenResponse.error);
              toast.error(`Authentication error: ${tokenResponse.error}`);
          }
        },
          error_callback: (error: any) => {
            console.error('❌ OAuth error callback:', error);
            toast.error('Failed to authenticate with Google');
          }
      });
        
      setTokenClient(client);
      setGisLoaded(true);
        console.log('✅ GIS client initialized successfully');
      } catch (error) {
        console.error('❌ Error initializing GIS client:', error);
        toast.error('Failed to initialize Google authentication');
    }
    }
  }, [redirectUri]);

  const handlePatientSelect = (patientId: string) => {
    const patient = patients.find(p => p.id === patientId);
    if (patient) {
      setSelectedPatient(patient);
      setFormData(prev => ({
        ...prev,
        patientName: patient.name,
        patientAge: patient.age?.toString() || '',
        patientGender: patient.gender || '',
      }));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleMedicineChange = (index: number, field: keyof Medicine, value: string) => {
    const updatedMedicines = [...medicines];
    updatedMedicines[index] = { ...updatedMedicines[index], [field]: value };
    setMedicines(updatedMedicines);
  };

  const addNewMedicineRow = () => {
    setMedicines([...medicines, { name: '', dosage: '', duration: '' }]);
  };

  const removeMedicine = (index: number) => {
    if (medicines.length > 1) {
      const updatedMedicines = medicines.filter((_, i) => i !== index);
      setMedicines(updatedMedicines);
    }
  };

  const generatePDFData = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Reduce header size - make it more compact
    doc.setFillColor(44, 62, 80); // Dark blue
    doc.rect(0, 0, pageWidth, 25, 'F'); // Reduced from 30 to 25

    // Add hospital name with smaller font
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18); // Reduced from 20
    doc.text('Hospital Clinic', pageWidth / 2, 12, { align: 'center' }); // Reduced Y position
    doc.setFontSize(8); // Reduced from 10
    doc.text('Healthcare Excellence', pageWidth / 2, 20, { align: 'center' }); // Reduced Y position

    // Move doctor information box up and make it more compact
    doc.setDrawColor(44, 62, 80);
    doc.setFillColor(244, 247, 250);
    doc.rect(10, 30, pageWidth - 20, 15, 'FD'); // Reduced Y position and height
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(9);
    doc.text('Doctor:', 15, 38);
    doc.setTextColor(0, 0, 0);
    doc.text(`Dr. ${doctor!.name} (${doctor!.specialization})`, 50, 38);

    // Date text - moved up and right aligned in its own section
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Date: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - 15, 38, { align: 'right' });

    // Add patient information with modern design - extremely compact
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(244, 247, 250);
    doc.rect(10, 48, pageWidth - 20, 12, 'FD'); // Minimal height
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(9);
    
    // Combine patient information on one line to save space
    const patientName = formData.patientName || selectedPatient?.name || '';
    const patientAge = formData.patientAge || selectedPatient?.age || '';
    const patientGender = formData.patientGender || selectedPatient?.gender || '';
    
    doc.text(`Patient: ${patientName} (${patientAge}y, ${patientGender})`, 15, 56);
    
    // Start complaint section higher up with minimal spacing
    const complaintY = 68; 
    
    // Add complaint section - new - with background - more compact
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(255, 255, 255);
    doc.rect(10, complaintY - 5, pageWidth - 20, 18, 'FD'); // Reduced height
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(9);
    doc.text('Complaint:', 15, complaintY);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    const complaintLines = doc.splitTextToSize(formData.complaint || 'N/A', pageWidth - 40);
    doc.text(complaintLines, 60, complaintY);
    
    // Calculate height with minimal spacing
    const complaintHeight = Math.max(15, complaintLines.length * 4 + 8); // Reduced minimum height
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(255, 255, 255);
    doc.rect(10, complaintY - 5, pageWidth - 20, complaintHeight, 'FD');
    
    // Redraw text
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(9);
    doc.text('Complaint:', 15, complaintY);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text(complaintLines, 60, complaintY);
    
    // Calculate starting Y for next section with minimal gap
    let contentY = complaintY + complaintHeight + 3; // Reduced spacing
    
    // Add diagnosis section - with different background - more compact
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(244, 247, 250);
    doc.rect(10, contentY - 5, pageWidth - 20, 18, 'FD'); // Reduced height
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(9);
    doc.text('Diagnosis:', 15, contentY);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    const diagnosisLines = doc.splitTextToSize(formData.diagnosis || 'N/A', pageWidth - 70);
    doc.text(diagnosisLines, 60, contentY);
    
    // Calculate diagnosis height with minimal spacing
    const diagnosisHeight = Math.max(15, diagnosisLines.length * 4 + 8); // Reduced minimum height
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(244, 247, 250);
    doc.rect(10, contentY - 5, pageWidth - 20, diagnosisHeight, 'FD');
    
    // Redraw text
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(9);
    doc.text('Diagnosis:', 15, contentY);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text(diagnosisLines, 60, contentY);
    
    // Update Y position with minimal gap
    contentY += diagnosisHeight + 3; // Reduced spacing
    
    // Add investigation section - with different background - more compact
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(255, 255, 255);
    doc.rect(10, contentY - 5, pageWidth - 20, 18, 'FD'); // Reduced height
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(9);
    doc.text('Investigation:', 15, contentY);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    const investigationLines = doc.splitTextToSize(formData.investigation || 'N/A', pageWidth - 70);
    doc.text(investigationLines, 60, contentY);
    
    // Calculate height with minimal spacing
    const investigationHeight = Math.max(15, investigationLines.length * 4 + 8); // Reduced minimum height
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(255, 255, 255);
    doc.rect(10, contentY - 5, pageWidth - 20, investigationHeight, 'FD');
    
    // Redraw text
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(9);
    doc.text('Investigation:', 15, contentY);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text(investigationLines, 60, contentY);
    
    // Update Y position with minimal gap
    contentY += investigationHeight + 3; // Reduced spacing
    
    // Add treatment section - with different background - more compact
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(244, 247, 250);
    doc.rect(10, contentY - 5, pageWidth - 20, 18, 'FD'); // Reduced height
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(9);
    doc.text('Treatment:', 15, contentY);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    const treatmentLines = doc.splitTextToSize(formData.treatment || 'N/A', pageWidth - 70);
    doc.text(treatmentLines, 60, contentY);
    
    // Calculate height with minimal spacing
    const treatmentHeight = Math.max(15, treatmentLines.length * 4 + 8); // Reduced minimum height
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(244, 247, 250);
    doc.rect(10, contentY - 5, pageWidth - 20, treatmentHeight, 'FD');
    
    // Redraw text
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(9);
    doc.text('Treatment:', 15, contentY);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text(treatmentLines, 60, contentY);
    
    // Update Y position with minimal gap
    contentY += treatmentHeight + 3; // Reduced spacing
    
    // Add medications section header with background - more compact
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(255, 255, 255);
    doc.rect(10, contentY - 5, pageWidth - 20, 12, 'FD'); // Reduced height
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(9);
    doc.text('Medications:', 15, contentY);
    
    // Update Y position for table with minimal gap
    contentY += 7; // Reduced spacing
    
    // Format medicines for the table - improved with clearer labels
    const medicationsData = medicines
      .filter(med => med.name.trim() !== '')
      .map(med => [
        med.name || 'N/A', 
        med.dosage || 'As directed', 
        med.duration || 'As needed'
      ]);

    // Add column headers with better clarity - more compact table
    autoTable(doc, {
      startY: contentY,
      head: [['Medicine Name', 'Dosage', 'Duration']],
      body: medicationsData,
      margin: { left: 15, right: 15 },
      headStyles: {
        fillColor: [44, 62, 80],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        cellPadding: 2 // Reduced padding
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 2 // Reduced padding
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 45 },
        2: { cellWidth: 45 }
      },
      alternateRowStyles: {
        fillColor: [244, 247, 250]
      }
    });

    // Get the Y position after the table
    const tableEndY = (doc as any).lastAutoTable.finalY || contentY + 5;
    const remainingSpace = pageHeight - tableEndY - 45; // Reduced space reserved for footer

    // Add instructions with background - more compact
    const instructionsHeight = Math.min(25, remainingSpace * 0.6); // Reduced height
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(244, 247, 250);
    doc.rect(10, tableEndY + 5, pageWidth - 20, instructionsHeight, 'FD'); // Reduced spacing
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(9);
    doc.text('Instructions:', 15, tableEndY + 12);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    const instructionLines = doc.splitTextToSize(formData.instructions, pageWidth - 40);
    doc.text(instructionLines, 60, tableEndY + 12);

    // Add next visit if specified - with light background - more compact
    let footerY = tableEndY + instructionsHeight + 8; // Reduced spacing
    if (formData.nextVisit) {
      doc.setDrawColor(220, 220, 220);
      doc.setFillColor(255, 255, 255);
      doc.rect(10, footerY - 5, pageWidth - 20, 12, 'FD'); // Reduced height
      doc.setTextColor(44, 62, 80);
      doc.setFontSize(9);
      doc.text('Next Visit:', 15, footerY);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      doc.text(format(new Date(formData.nextVisit), 'dd/MM/yyyy'), 60, footerY);
      footerY += 12; // Reduced spacing
    }

    // Add doctor's notes if any - with alternating background - more compact
    if (formData.doctorNotes && formData.doctorNotes.trim() !== '') {
      const notesHeight = Math.min(20, pageHeight - footerY - 40); // Reduced height
      if (notesHeight > 8) { // Only add if there's enough space
        doc.setDrawColor(220, 220, 220);
      doc.setFillColor(244, 247, 250);
        doc.rect(10, footerY, pageWidth - 20, notesHeight, 'FD');
      doc.setTextColor(44, 62, 80);
        doc.setFontSize(9);
        doc.text('Doctor\'s Notes:', 15, footerY + 6); // Reduced spacing
      doc.setTextColor(0, 0, 0);
        doc.setFontSize(8);
        const noteLines = doc.splitTextToSize(formData.doctorNotes, pageWidth - 70);
        doc.text(noteLines, 60, footerY + 6);
        footerY += notesHeight + 5; // Reduced spacing
      }
    }

    // Add signature section - more compact
    const signatureY = Math.min(pageHeight - 25, footerY + 15);
    doc.setDrawColor(44, 62, 80);
    doc.line(pageWidth - 70, signatureY, pageWidth - 20, signatureY);
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(8);
    doc.text(doctor!.name, pageWidth - 45, signatureY + 4, { align: 'center' });
    doc.setFontSize(7);
    doc.text(doctor!.specialization, pageWidth - 45, signatureY + 10, { align: 'center' });

    // Add footer with gradient - more compact
    doc.setFillColor(44, 62, 80);
    doc.rect(0, pageHeight - 15, pageWidth, 15, 'F'); // Reduced height
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7); // Reduced font size
    doc.text('Hospital Clinic Management System', pageWidth / 2, pageHeight - 9, { align: 'center' });
    doc.text('24/7 Emergency Contact: +1 234 567 890', pageWidth / 2, pageHeight - 4, { align: 'center' });

    return doc;
  };

  // Save prescription to Firestore
  const savePrescriptionToFirestore = async (downloadUrl: string | null, fileName: string) => {
    try {
      console.log('🔵 Starting to save prescription to Firestore');
      
      if (!selectedPatient || !doctor) {
        console.error('❌ Cannot save prescription: missing patient or doctor info');
        return null;
      }
      
      // Prepare data with proper type handling, avoiding complex objects
      // that might cause issues with Firestore
      const medicinesList = medicines
        .filter(m => m.name.trim() !== '')
        .map(m => ({
          name: m.name,
          dosage: m.dosage,
          duration: m.duration
        }));
      
      console.log('📋 Medicine list to save:', JSON.stringify(medicinesList));
      
      // Format dates properly for better Firestore compatibility
      let nextVisitDate = null;
      if (formData.nextVisit) {
        try {
          nextVisitDate = new Date(formData.nextVisit).toISOString();
        } catch (e) {
          console.warn('⚠️ Invalid nextVisit date format, saving as null');
        }
      }
      
      // Create a clean prescription object with only the necessary fields
      const prescriptionData = {
        patientId: selectedPatient.id,
        patientName: formData.patientName || '',
        doctorId: doctor.userId || '',
        doctorName: doctor.name || '',
        complaint: formData.complaint || '',
        investigation: formData.investigation || '',
        treatment: formData.treatment || '',
        diagnosis: formData.diagnosis || '',
        medicines: medicinesList,
        instructions: formData.instructions || '',
        nextVisit: nextVisitDate,
        notes: formData.doctorNotes || '',
        fileName: fileName || '',
        downloadUrl: downloadUrl || 'local-only',
        status: 'active',
        createdAt: new Date().toISOString() // Use ISO string instead of serverTimestamp
      };
      
      console.log('📄 Clean prescription data ready for Firestore:', 
        JSON.stringify(prescriptionData, null, 2));
      
      console.log('🔵 Attempting direct save to Firestore (without serverTimestamp)');
      
      try {
        // Add to Firestore with direct timestamp rather than serverTimestamp
        const prescriptionRef = await addDoc(collection(db, 'prescriptions'), prescriptionData);
        console.log('✅ Prescription saved to database with ID:', prescriptionRef.id);
        return prescriptionRef.id;
      } catch (firestoreError) {
        console.error('❌ Firestore addDoc operation failed:', firestoreError);
        throw firestoreError;
      }
    } catch (error: any) {
      console.error('❌ Error saving prescription to database:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      throw new Error(`Database error: ${error.message}`);
    }
  };

  const uploadFileToDrive = async (fileBlob: Blob, fileName: string): Promise<DriveUploadResult> => {
    return new Promise((resolve, reject) => {
      // First check if we're on the server
      if (typeof window === 'undefined') {
        console.warn('⚠️ Running on server, skipping Drive upload');
        const localResult: DriveUploadResult = {
          id: 'local-' + Date.now(),
          name: fileName,
          webViewLink: null,
          localOnly: true,
          reason: 'Server-side rendering'
        };
        
        resolve(localResult);
        return;
      }

      // Check if Drive integration is disabled
      if (!driveEnabled) {
        console.log('🔵 Google Drive integration is disabled, skipping upload');
        const localResult: DriveUploadResult = {
          id: 'local-' + Date.now(),
          name: fileName,
          webViewLink: null,
          localOnly: true,
          reason: 'Drive integration disabled'
        };
        
        resolve(localResult);
          return;
        }

      // Check if we have a saved token and try to use it first
      const savedToken = isPersistentAuth ? localStorage.getItem('googleDriveToken') : null;
      if (savedToken && isPersistentAuth) {
        console.log('🔵 Using saved token from previous authentication');
        
        // Use the saved token directly
        performUpload(savedToken)
          .then(result => {
            if (result.error) {
              console.warn('⚠️ Saved token failed, falling back to normal auth');
              requestNewToken();
            } else {
              resolve(result);
            }
          })
          .catch(() => {
            console.warn('⚠️ Saved token failed, falling back to normal auth');
            requestNewToken();
          });
        
        return;
      }
      
      // If no saved token, continue with regular auth flow
      requestNewToken();
      
      // Helper function to perform the actual upload with a token
      async function performUpload(accessToken: string) {
        try {
          console.log('🔵 Performing upload with access token');
          
          // Create file metadata
          const metadata = {
            name: fileName,
            mimeType: 'application/pdf',
          };

          // Create form data
          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
          form.append('file', fileBlob);

          // Upload to Google Drive - simplified approach
          console.log('🔵 Using direct fetch with access token for upload');
          
          try {
          const uploadResponse = await fetch(
              'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            {
              method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` },
              body: form
            }
          );

          if (!uploadResponse.ok) {
              return { 
                id: 'error-' + Date.now(),
                name: fileName,
                error: `Upload failed with status: ${uploadResponse.status}`,
                localOnly: true,
                webViewLink: null
              } as DriveUploadResult;
          }

          const result = await uploadResponse.json();
            console.log('✅ File uploaded successfully');
            console.log('✅ Raw Drive API response:', JSON.stringify(result, null, 2));
            
            // Make the file publicly viewable
            try {
              console.log('🔵 Making file publicly viewable');
              const shareResponse = await fetch(
                `https://www.googleapis.com/drive/v3/files/${result.id}/permissions`,
                {
                  method: 'POST',
                  headers: { 
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    role: 'reader',
                    type: 'anyone'
                  })
                }
              );
              
              if (shareResponse.ok) {
                console.log('✅ File permissions updated for public access');
              } else {
                console.warn('⚠️ Could not update file permissions:', await shareResponse.text());
              }
            } catch (shareError) {
              console.warn('⚠️ Error updating file permissions:', shareError);
            }
            
            // Create a direct link to the file
            const directViewLink = `https://drive.google.com/file/d/${result.id}/view`;
            console.log('✅ Direct view link created:', directViewLink);
            
            // Simplify the result object to avoid potential issues
            const simplifiedResult: DriveUploadResult = {
              id: result.id || 'unknown-id',
              name: result.name || fileName,
              webViewLink: directViewLink,
              localOnly: false
            };
            
            console.log('✅ Returning simplified result:', JSON.stringify(simplifiedResult, null, 2));
            return simplifiedResult;
          } catch (fetchError) {
            console.error('❌ Fetch error during upload:', fetchError);
            return { 
              id: 'error-' + Date.now(),
              name: fileName,
              error: 'Fetch error',
              localOnly: true,
              webViewLink: null
            } as DriveUploadResult;
          }
        } catch (error) {
          console.error('❌ General error during upload:', error);
          return { 
            id: 'error-' + Date.now(),
            name: fileName,
            error: 'General error', 
            localOnly: true,
            webViewLink: null
          } as DriveUploadResult;
        }
      }
      
      // Function to request a new token through the OAuth flow
      function requestNewToken() {
        // Then check if Google APIs are properly initialized
        if (!gapiLoaded || !gisLoaded || !tokenClient) {
          console.warn('⚠️ Google API not fully initialized, skipping Drive upload');
          
          // Return a "local-only" result instead of rejecting
          const localResult: DriveUploadResult = {
            id: 'local-' + Date.now(),
            name: fileName,
            webViewLink: null,
            localOnly: true,
            reason: 'Google APIs not initialized'
          };
          
          toast.warning('Google Drive upload skipped - APIs not available');
          resolve(localResult);
          return;
        }

        // First request access token
        try {
          console.log('🔵 Requesting Google OAuth token');
          
          // Set a simpler callback that doesn't add complexity
          tokenClient.callback = async (tokenResponse: any) => {
            // Handle error case
            if (tokenResponse.error) {
              console.error('❌ Error getting access token:', tokenResponse.error);
              
              const localResult: DriveUploadResult = {
                id: 'local-' + Date.now(),
                name: fileName,
                webViewLink: null,
                localOnly: true,
                reason: `OAuth error: ${tokenResponse.error}`
              };
              
              toast.warning(`Google authentication failed: ${tokenResponse.error}`);
              resolve(localResult);
              return;
            }

            // On successful authentication, save the token if persistent auth is enabled
            const accessToken = tokenResponse.access_token;
            console.log('✅ Access token acquired');
            
            if (isPersistentAuth && accessToken) {
              try {
                localStorage.setItem('googleDriveToken', accessToken);
                console.log('✅ Saved Google Drive token to localStorage');
                setHasSavedToken(true);
              } catch (storageError) {
                console.warn('⚠️ Could not save token to localStorage:', storageError);
              }
            }
            
            // Perform the upload with the new token
            const result = await performUpload(accessToken);
            if (result.error) {
              const localResult: DriveUploadResult = {
                id: 'local-' + Date.now(),
                name: fileName,
                webViewLink: null,
                localOnly: true,
                reason: result.error,
                error: result.error
              };
              
              toast.warning('Upload failed. Prescription saved locally.');
              resolve(localResult);
            } else {
              resolve(result);
            }
          };

          // Request token with popup consent
          console.log('🔵 Requesting access token with popup consent');
          tokenClient.requestAccessToken({ prompt: isPersistentAuth ? 'consent' : 'select_account' });
        } catch (tokenError) {
          console.error('❌ Error in token request:', tokenError);
          
          const localResult: DriveUploadResult = {
            id: 'local-' + Date.now(),
            name: fileName,
            webViewLink: null,
            localOnly: true,
            reason: 'Token request error',
            error: 'Token request error'
          };
          
          toast.warning('Authentication failed. Prescription saved locally.');
          resolve(localResult);
        }
      }
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Make sure we always have a chance to reset loading state
    const resetLoadingState = () => {
      setIsUploading(false);
      setUploadStatus('idle');
      toast.dismiss(); // Clear any pending toasts
    };

    try {
      if (!selectedPatient || !doctor) {
        toast.error('Please select a patient first');
        return;
      }

      // Start loading
      setIsUploading(true);
      setUploadStatus('loading');
      toast.loading('Processing prescription...');

      // Generate PDF
      const doc = generatePDFData();
      const pdfBlob = doc.output('blob');

      // Create filename
      const fileName = `prescription_${formData.patientName.replace(/\s+/g, '_')}_${format(new Date(), 'dd-MM-yyyy')}.pdf`;

      // Check if we're only previewing (not saving locally and Drive disabled)
      const isPreviewOnly = !localDownload && !driveEnabled;
      
      // Save PDF locally or open in browser based on preference
      if (localDownload) {
      doc.save(fileName);
        console.log('⭐ PDF generated and saved locally');
      } else {
        // Open PDF in a new tab
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');
        console.log('⭐ PDF generated and opened in browser');
      }
      
      // CHANGED ORDER: First attempt Google Drive upload to get URL
      let downloadUrl = isPreviewOnly ? 'preview-only' : 'local-only';
      let uploadResult: DriveUploadResult | null = null;
      
      if (driveEnabled) {
        try {
          console.log('⭐ Attempting Google Drive upload FIRST');
          uploadResult = await uploadFileToDrive(pdfBlob, fileName) as DriveUploadResult;
          console.log('Upload result:', JSON.stringify(uploadResult, null, 2));

          if (uploadResult && !uploadResult.localOnly && uploadResult.webViewLink) {
            downloadUrl = uploadResult.webViewLink;
            console.log('✅ Got Google Drive URL for Firestore:', downloadUrl);
          } else {
            console.log('ℹ️ Upload returned local-only result');
          }
        } catch (uploadError) {
          console.error('❌ Error during Drive upload:', uploadError);
          // Continue with local-only mode
          toast.warning('Google Drive upload failed. Continuing with local-only mode.');
        }
      } else {
        console.log('ℹ️ Google Drive integration disabled, using local-only mode');
      }
      
      // Always save to Firestore regardless of PDF storage preference
      try {
        console.log('⭐ Saving prescription data to Firestore with status:', downloadUrl);
        // Pass the URL directly to the save function
        const prescriptionId = await savePrescriptionToFirestore(downloadUrl, fileName);
        console.log('✅ Successfully saved to Firestore with ID:', prescriptionId);
        
        if (isPreviewOnly) {
          setUploadStatus('preview-only');
          toast.success('Prescription data saved. PDF available for preview only.');
        } else if (downloadUrl === 'local-only') {
        setUploadStatus('success');
          toast.success('Prescription saved successfully (local only).');
      } else {
          setUploadStatus('success');
          toast.success('Prescription saved and uploaded to Drive successfully!');
        }
      } catch (saveError) {
        console.error('❌ Failed Firestore save:', saveError);
        toast.error('Failed to save prescription data. Please try again.');
        setUploadStatus('error');
      }
    } catch (error: any) {
      console.error('❌ Error in prescription process:', error);
      setUploadStatus('error');
      toast.error(`Error: ${error.message || 'Unknown error'}`);
    } finally {
      // Always reset loading state
      resetLoadingState();
    }
  };

  // Add a test function to check Firestore connectivity
  const testFirestoreConnection = async () => {
    try {
      console.log('🧪 Testing Firestore connection...');
      
      // Try to add a test document
      const testData = {
        test: true,
        timestamp: serverTimestamp(),
        message: 'Test prescription document',
      };
      
      console.log('🧪 Adding test document to prescriptions collection...');
      const testRef = await addDoc(collection(db, 'prescriptions'), testData);
      console.log('✅ Test document added successfully with ID:', testRef.id);
      return true;
    } catch (error: any) {
      console.error('❌ Firestore test failed:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      return false;
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
            <CardTitle className="text-red-700">Connection Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700 mb-4">{error}</p>
            <ul className="list-disc list-inside space-y-2 text-red-700">
              <li>Disabling your ad blocker for this site</li>
              <li>Checking your firewall settings</li>
              <li>Ensuring you have a stable internet connection</li>
              <li>Refreshing the page</li>
            </ul>
            <Button
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto pt-8 pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Generate Prescription</h1>
        <p className="text-gray-500 mt-1">Create and download prescription as PDF</p>
      </div>
      
      {driveEnabled && !hasSavedToken && (
        <Card className="mb-6 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-700 text-lg">Google API Project Not Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-blue-700 mb-4">Your Google Cloud project requires additional configuration:</p>
            
            <div className="bg-white p-3 rounded border border-blue-200 mb-4">
              <p className="font-bold text-blue-800 mb-2">Error: "Access blocked: Clinic Management has not completed the Google verification process"</p>
              <p className="text-blue-700 mb-1">This means your Google Cloud project is in testing mode and you need to either:</p>
              <ol className="list-decimal list-inside space-y-1 text-blue-700 mb-2">
                <li>Add <b className="text-blue-900">{typeof window !== 'undefined' ? window.sessionStorage.getItem('userEmail') || 'your email' : 'your email'}</b> as a test user, or</li>
                <li>Complete the Google verification process for your app</li>
              </ol>
            </div>
            
            <p className="font-bold text-blue-800 mb-2">Option 1: Add yourself as a test user (Quickest)</p>
            <ol className="list-decimal list-inside space-y-2 text-blue-700 mb-4">
              <li>Go to the <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" className="underline">OAuth consent screen</a> in Google Cloud Console</li>
              <li>Scroll down to "Test users" and click "ADD USERS"</li>
              <li>Add your Gmail address (the one you're signed in with now)</li>
              <li>Save changes and wait 5-10 minutes for them to take effect</li>
            </ol>
            
            <p className="font-bold text-blue-800 mb-2">Option 2: Switch to local-only mode (Recommended for now)</p>
            <p className="text-blue-700 mb-4">
              Until you complete Google verification, it's recommended to leave Drive integration disabled
              and use the local-only mode for prescriptions.
            </p>
            
            <div className="bg-amber-50 border border-amber-200 p-3 rounded mt-4">
              <p className="text-amber-800">
                <b>Pro Tip:</b> For a development environment, adding your email as a test user (Option 1)
                is the simplest solution. For production, you would need to complete Google's verification
                process, which can take several days.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test connection button and View History button */}
      <div className="mb-4 flex gap-4">
        <Button
          onClick={() => window.open('/dashboard/doctor/prescriptions/history', '_blank')}
          variant="secondary"
          size="sm"
        >
          View Prescription History
        </Button>
        
        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center gap-2 mr-4">
            <span className="text-sm text-gray-500">Google Drive:</span>
            <Button
              onClick={() => setDriveEnabled(!driveEnabled)}
              variant={driveEnabled ? "default" : "outline"}
              size="sm"
              className={driveEnabled ? "bg-black hover:bg-gray-800 text-white" : ""}
            >
              {driveEnabled ? "ENABLED" : "DISABLED"}
            </Button>
          </div>
          
          <div className="flex items-center gap-2 mr-4">
            <span className="text-sm text-gray-500">Local Download:</span>
            <Button
              onClick={() => setLocalDownload(!localDownload)}
              variant={localDownload ? "default" : "outline"}
              size="sm"
              className={localDownload ? "bg-black hover:bg-gray-800 text-white" : ""}
            >
              {localDownload ? "DOWNLOAD" : "PREVIEW"}
            </Button>
          </div>
          
          {driveEnabled && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Remember Authorization:</span>
              <Button
                onClick={() => setIsPersistentAuth(!isPersistentAuth)}
                variant={isPersistentAuth ? "default" : "outline"}
                size="sm"
                className={isPersistentAuth ? "bg-black hover:bg-gray-800 text-white" : ""}
              >
                {isPersistentAuth ? "ON" : "OFF"}
              </Button>
              {hasSavedToken && isPersistentAuth && (
                <span className="text-xs text-green-600">✓ Authorized</span>
              )}
            </div>
          )}
          
          <div className="w-full md:w-auto mt-2 md:mt-0">
            <span className="text-xs text-gray-600 block md:inline">
              {driveEnabled 
                ? isPersistentAuth 
                  ? "PDFs will be uploaded to Drive with saved authorization" 
                  : "PDFs will be uploaded to Drive (auth required each time)"
                : localDownload
                  ? "Local-only mode (PDFs saved locally)"
                  : "Local-only mode (PDFs opened in browser)"
              }
            </span>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="mb-2">Prescription Form</CardTitle>
          <CardDescription>Fill in the prescription details to generate a PDF</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleFormSubmit}>
            {/* Patient Information */}
            <div className="space-y-4">
              <h3 className="font-medium">Patient Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="patientSelect">Select Patient</Label>
                  <Select
                    defaultValue={selectedPatient?.id}
                    onValueChange={handlePatientSelect}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a patient" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.length === 0 ? (
                        <SelectItem value="no-patients" disabled>
                          No patients found
                        </SelectItem>
                      ) : (
                        patients.map((patient) => (
                          <SelectItem key={patient.id} value={patient.id}>
                            {patient.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {patients.length === 0 && !isLoading && (
                    <p className="text-sm text-red-500 mt-1">
                      No patients available. Please add patients first.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patientAge">Age</Label>
                  <Input
                    id="patientAge"
                    name="patientAge"
                    value={formData.patientAge}
                    readOnly
                    className="bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patientGender">Gender</Label>
                  <Input
                    id="patientGender"
                    name="patientGender"
                    value={formData.patientGender}
                    readOnly
                    className="bg-gray-50"
                  />
                </div>
              </div>
            </div>

            {/* Complaint */}
            <div className="space-y-2">
              <Label htmlFor="complaint">Chief Complaint</Label>
              <Textarea
                id="complaint"
                name="complaint"
                value={formData.complaint}
                onChange={handleInputChange}
                placeholder="Patient's main complaints"
                className="min-h-[80px]"
              />
            </div>

            {/* Diagnosis */}
            <div className="space-y-2">
              <Label htmlFor="diagnosis">Diagnosis</Label>
              <Textarea
                id="diagnosis"
                name="diagnosis"
                value={formData.diagnosis}
                onChange={handleInputChange}
                required
              />
            </div>
            
            {/* Investigation */}
            <div className="space-y-2">
              <Label htmlFor="investigation">Investigation</Label>
              <Textarea
                id="investigation"
                name="investigation"
                value={formData.investigation}
                onChange={handleInputChange}
                placeholder="Test results, lab reports, etc."
                className="min-h-[80px]"
              />
            </div>
            
            {/* Treatment */}
            <div className="space-y-2">
              <Label htmlFor="treatment">Treatment</Label>
              <Textarea
                id="treatment"
                name="treatment"
                value={formData.treatment}
                onChange={handleInputChange}
                placeholder="Treatment plan excluding medications"
                className="min-h-[80px]"
              />
            </div>

            {/* Medications */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Medications</Label>
                <Button
                  type="button"
                  onClick={addNewMedicineRow}
                  className="flex items-center gap-2"
                  variant="outline"
                  size="sm"
                >
                  <Plus className="h-4 w-4" /> Add Medicine
                </Button>
              </div>
              <div className="space-y-4">
                {medicines.map((medicine, index) => (
                  <div key={index} className="flex gap-4 items-start">
                    <div className="flex-1">
                      <Label htmlFor={`medicine-name-${index}`}>Medicine Name</Label>
                      <MedicineAutocomplete
                        id={`medicine-name-${index}`}
                        value={medicine.name}
                        onSelect={(value) => handleMedicineChange(index, 'name', value)}
                        placeholder="Enter medicine name"
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={`medicine-dosage-${index}`}>Dosage</Label>
                      <Input
                        id={`medicine-dosage-${index}`}
                        value={medicine.dosage}
                        onChange={(e) => handleMedicineChange(index, 'dosage', e.target.value)}
                        placeholder="e.g., 1-0-1"
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={`medicine-duration-${index}`}>Duration</Label>
                      <Input
                        id={`medicine-duration-${index}`}
                        value={medicine.duration}
                        onChange={(e) => handleMedicineChange(index, 'duration', e.target.value)}
                        placeholder="e.g., 7 days"
                        required
                      />
                    </div>
                    {medicines.length > 1 && (
                      <Button
                        type="button"
                        onClick={() => removeMedicine(index)}
                        variant="ghost"
                        size="icon"
                        className="mt-6"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-2">
              <Label htmlFor="instructions">Instructions</Label>
              <Textarea
                id="instructions"
                name="instructions"
                value={formData.instructions}
                onChange={handleInputChange}
                required
              />
            </div>

            {/* Next Visit - Made Optional */}
            <div className="space-y-2">
              <Label htmlFor="nextVisit">Next Visit (Optional)</Label>
              <Input
                id="nextVisit"
                name="nextVisit"
                type="date"
                value={formData.nextVisit}
                onChange={handleInputChange}
              />
            </div>

            {/* Doctor's Notes */}
            <div className="space-y-2">
              <Label htmlFor="doctorNotes">Doctor's Notes (Optional)</Label>
              <Textarea
                id="doctorNotes"
                name="doctorNotes"
                value={formData.doctorNotes}
                onChange={handleInputChange}
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={!selectedPatient || isUploading}
            >
              {isUploading ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-b-2 border-current"></div>
                  Processing...
                </>
              ) : !driveEnabled && !localDownload ? (
                'Generate Prescription (Preview Only)'
              ) : !driveEnabled ? (
                'Generate Prescription (Local Only)'
              ) : !gapiLoaded || !gisLoaded ? (
                'Generate Prescription (Google Drive Not Ready)'
              ) : (
                'Generate & Save With Google Drive'
              )}
            </Button>

            {/* Status messages */}
            {uploadStatus === 'success' && (
              <div className="mt-4 p-4 bg-green-50 text-green-700 rounded-md">
                Prescription generated and saved successfully!
              </div>
            )}
            {uploadStatus === 'preview-only' && (
              <div className="mt-4 p-4 bg-blue-50 text-blue-700 rounded-md">
                <p className="font-medium">Preview Only</p>
                <p>Prescription was generated for preview in your browser. No permanent copy was saved.</p>
              </div>
            )}
            {uploadStatus === 'error' && (
              <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md">
                Prescription generation failed. Please try again.
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}