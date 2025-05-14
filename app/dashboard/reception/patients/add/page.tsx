'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, doc, setDoc, getDoc } from 'firebase/firestore';
import { auth } from '@/lib/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { getUserRole } from '@/lib/firebase/auth';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const patientSchema = z.object({
    name: z.string().min(2, 'Name is required'),
    dateOfBirth: z.string().min(1, 'Date of birth is required'),
    gender: z.enum(['Male', 'Female', 'Other']),
    bodyWeight: z.number().min(0, 'Body weight must be a positive number').optional(),
    phone: z.string().min(10, 'Phone is required'),
    email: z.string().email('Invalid email'),
    address: z.string().min(2, 'Address is required'),
    guardian: z.string().optional(),
    bloodGroup: z.string().optional(),
    notes: z.string().optional(),
});

type PatientFormValues = z.infer<typeof patientSchema>;

export default function AddPatientPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                router.push('/auth/signin');
                return;
            }

            try {
                const role = await getUserRole(user.uid);
                if (role !== 'reception') {
                    toast.error('You do not have access to this page');
                    router.push('/auth/role-selection');
                }
            } catch (error) {
                console.error('Error verifying role:', error);
                toast.error('Error verifying permissions');
                router.push('/auth/role-selection');
            } finally {
                setIsLoading(false);
            }
        });

        return () => unsubscribe();
    }, [router]);

    const form = useForm<PatientFormValues>({
        resolver: zodResolver(patientSchema),
        defaultValues: {
            name: '',
            dateOfBirth: '',
            gender: 'Male',
            bodyWeight: undefined,
            phone: '',
            email: '',
            address: '',
            guardian: '',
            bloodGroup: '',
            notes: '',
        },
    });

    const onSubmit = async (data: PatientFormValues) => {
        try {
            console.log('🔵 [Auth Check] Starting patient creation process...');
            if (!auth.currentUser) {
                console.log('❌ [Auth Error] No authenticated user found');
                toast.error('You must be logged in to add a patient');
                router.push('/auth/signin');
                return;
            }

            const currentUser = auth.currentUser;
            console.log('✅ [Auth Success] User authenticated:', currentUser.uid);
            
            // Get user document directly
            console.log('🔵 [Role Check] Verifying user role...');
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (!userDoc.exists()) {
                console.log('❌ [Role Error] User document not found');
                toast.error('User profile not found. Please sign out and sign in again.');
                return;
            }

            const userData = userDoc.data();
            console.log('✅ [Role Success] User role verified:', userData.role);
            
            if (userData.role !== 'reception') {
                console.log('❌ [Permission Error] Invalid role:', userData.role);
                toast.error('You do not have permission to add patients');
                return;
            }

            console.log('🔵 [Validation] Validating patient data...');
            const birthDate = new Date(data.dateOfBirth);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }

            if (isNaN(age) || age < 0) {
                console.log('❌ [Validation Error] Invalid age value');
                toast.error('Please enter a valid age.');
                return;
            }

            if (!data.name || !data.phone || !data.email || !data.address) {
                console.log('❌ [Validation Error] Missing required fields');
                toast.error('Please fill all required fields.');
                return;
            }
            console.log('✅ [Validation Success] All patient data validated');

            // Calculate age from date of birth
            const ageData = {
                name: data.name,
                dateOfBirth: birthDate,
                age: age,
                gender: data.gender,
                bodyWeight: data.bodyWeight,
                phone: data.phone,
                email: data.email,
                address: data.address,
                guardian: data.guardian || '',
                bloodGroup: data.bloodGroup || '',
                notes: data.notes || '',
                createdAt: new Date().toISOString(),
                createdBy: currentUser.uid
            };

            console.log('🔵 [Firestore] Attempting to create patient document...', ageData);

            // Use addDoc instead of setDoc
            const patientsRef = collection(db, 'patients');
            const docRef = await addDoc(patientsRef, ageData);
            
            console.log('✅ [Firestore Success] Patient document created with ID:', docRef.id);

            // Try to send welcome email
            console.log('🔵 [Email] Attempting to send welcome email...');
            try {
                const emailResponse = await fetch('/api/send-patient-welcome', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: data.email,
                        name: data.name,
                        patientId: docRef.id,
                    }),
                });
                
                if (!emailResponse.ok) {
                    const errorData = await emailResponse.json();
                    console.log('❌ [Email Error] Failed to send welcome email. Status:', emailResponse.status, 'Error:', errorData);
                } else {
                    console.log('✅ [Email Success] Welcome email sent successfully');
                }
            } catch (emailError) {
                console.log('❌ [Email Error] Exception while sending welcome email:', emailError);
                // Continue anyway since patient was created
            }

            console.log('✅ [Process Complete] Patient creation process finished successfully');
            toast.success('Patient added successfully!');
            router.push('/dashboard/reception');
        } catch (error) {
            console.log('❌ [Fatal Error] Unexpected error during patient creation:', error);
            console.error('Error adding patient:', error);
            toast.error('Failed to add patient. Please try again.');
        }
    };

    return (
        <>
            {!isLoading && (
                <div className="container mx-auto max-w-2xl py-10">
                    <div className="bg-white rounded-xl shadow-lg p-8">
                        <h1 className="text-3xl font-bold mb-2 text-primary">Add New Patient</h1>
                        <p className="text-gray-600 mb-6">
                            Please fill in the patient's details below. All fields marked with <span className="text-red-500">*</span> are required.
                        </p>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div>
                                    <label className="block mb-1 font-medium">
                                        Full Name <span className="text-red-500">*</span>
                                    </label>
                                    <Input {...form.register('name')} placeholder="Enter full name" />
                                    {form.formState.errors.name && (
                                        <p className="text-red-500 text-sm">{form.formState.errors.name.message}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block mb-1 font-medium">
                                        Date of Birth <span className="text-red-500">*</span>
                                    </label>
                                    <Input 
                                        type="date" 
                                        {...form.register('dateOfBirth')}
                                        max={new Date().toISOString().split('T')[0]}
                                    />
                                    {form.formState.errors.dateOfBirth && (
                                        <p className="text-red-500 text-sm">{form.formState.errors.dateOfBirth.message}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block mb-1 font-medium">
                                        Body Weight (kg)
                                    </label>
                                    <Input 
                                        type="number" 
                                        step="0.1"
                                        {...form.register('bodyWeight', { valueAsNumber: true })}
                                        placeholder="Enter body weight"
                                        min={0}
                                    />
                                    {form.formState.errors.bodyWeight && (
                                        <p className="text-red-500 text-sm">{form.formState.errors.bodyWeight.message}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block mb-1 font-medium">
                                        Gender <span className="text-red-500">*</span>
                                    </label>
                                    <Select 
                                        onValueChange={(value) => form.setValue('gender', value as 'Male' | 'Female' | 'Other')}
                                        defaultValue={form.getValues('gender')}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select gender" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Male">Male</SelectItem>
                                            <SelectItem value="Female">Female</SelectItem>
                                            <SelectItem value="Other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {form.formState.errors.gender && (
                                        <p className="text-red-500 text-sm">{form.formState.errors.gender.message}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block mb-1 font-medium">
                                        Phone <span className="text-red-500">*</span>
                                    </label>
                                    <Input {...form.register('phone')} placeholder="Enter phone number" />
                                    {form.formState.errors.phone && (
                                        <p className="text-red-500 text-sm">{form.formState.errors.phone.message}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block mb-1 font-medium">
                                        Email <span className="text-red-500">*</span>
                                    </label>
                                    <Input {...form.register('email')} placeholder="Enter email" />
                                    {form.formState.errors.email && (
                                        <p className="text-red-500 text-sm">{form.formState.errors.email.message}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block mb-1 font-medium">
                                        Address <span className="text-red-500">*</span>
                                    </label>
                                    <Input {...form.register('address')} placeholder="Enter address" />
                                    {form.formState.errors.address && (
                                        <p className="text-red-500 text-sm">{form.formState.errors.address.message}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block mb-1 font-medium">Guardian Name</label>
                                    <Input {...form.register('guardian')} placeholder="Enter guardian name (if any)" />
                                </div>
                                <div>
                                    <label className="block mb-1 font-medium">Blood Group</label>
                                    <Select onValueChange={(value) => form.setValue('bloodGroup', value)}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select blood group" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="not-specified">Not specified</SelectItem>
                                            <SelectItem value="A+">A+</SelectItem>
                                            <SelectItem value="A-">A-</SelectItem>
                                            <SelectItem value="B+">B+</SelectItem>
                                            <SelectItem value="B-">B-</SelectItem>
                                            <SelectItem value="AB+">AB+</SelectItem>
                                            <SelectItem value="AB-">AB-</SelectItem>
                                            <SelectItem value="O+">O+</SelectItem>
                                            <SelectItem value="O-">O-</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div>
                                <label className="block mb-1 font-medium">Additional Notes</label>
                                <Textarea
                                    {...form.register('notes')}
                                    placeholder="Any additional information..."
                                    className="min-h-[80px]"
                                />
                            </div>
                            <Button type="submit" className="w-full mt-4 text-lg py-6">
                                Add Patient
                            </Button>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
