"""
Test Premium Tab Utility Functions

This module provides utility functions for data processing, analytics,
and sample data generation for the test premium tab.
"""

import pandas as pd
import numpy as np
import random
import string
from datetime import datetime, timedelta
from typing import List, Dict, Any, Union
import json

class TestDataProcessor:
    """Data processing utilities for the test premium tab."""
    
    def __init__(self):
        self.processed_count = 0
        
    def analyze_dataset(self, dataset: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze a dataset and return statistical information."""
        if not dataset:
            return {'error': 'Empty dataset provided'}
        
        try:
            # Convert to pandas DataFrame
            df = pd.DataFrame(dataset)
            
            # Basic statistics
            stats = {
                'row_count': len(df),
                'column_count': len(df.columns),
                'columns': list(df.columns),
                'data_types': df.dtypes.to_dict(),
                'memory_usage': df.memory_usage(deep=True).sum(),
                'null_counts': df.isnull().sum().to_dict()
            }
            
            # Numeric column analysis
            numeric_columns = df.select_dtypes(include=[np.number]).columns
            if len(numeric_columns) > 0:
                numeric_stats = df[numeric_columns].describe().to_dict()
                stats['numeric_analysis'] = numeric_stats
                
                # Correlation matrix if multiple numeric columns
                if len(numeric_columns) > 1:
                    correlation_matrix = df[numeric_columns].corr().to_dict()
                    stats['correlations'] = correlation_matrix
            
            # String column analysis
            string_columns = df.select_dtypes(include=['object']).columns
            if len(string_columns) > 0:
                string_stats = {}
                for col in string_columns:
                    string_stats[col] = {
                        'unique_count': df[col].nunique(),
                        'most_common': df[col].value_counts().head(5).to_dict(),
                        'avg_length': df[col].astype(str).str.len().mean()
                    }
                stats['string_analysis'] = string_stats
            
            # Date column analysis (if any)
            date_columns = df.select_dtypes(include=['datetime64']).columns
            if len(date_columns) > 0:
                date_stats = {}
                for col in date_columns:
                    date_stats[col] = {
                        'min_date': df[col].min().isoformat() if pd.notna(df[col].min()) else None,
                        'max_date': df[col].max().isoformat() if pd.notna(df[col].max()) else None,
                        'date_range_days': (df[col].max() - df[col].min()).days if pd.notna(df[col].min()) and pd.notna(df[col].max()) else None
                    }
                stats['date_analysis'] = date_stats
            
            self.processed_count += 1
            stats['processing_metadata'] = {
                'processed_at': datetime.now().isoformat(),
                'processor_instance_count': self.processed_count
            }
            
            return stats
            
        except Exception as e:
            return {'error': f'Analysis failed: {str(e)}'}
    
    def generate_time_series(self, days: int = 30, frequency: str = 'daily') -> List[Dict[str, Any]]:
        """Generate time series data for testing."""
        data = []
        start_date = datetime.now() - timedelta(days=days)
        
        if frequency == 'daily':
            delta = timedelta(days=1)
        elif frequency == 'hourly':
            delta = timedelta(hours=1)
        elif frequency == 'weekly':
            delta = timedelta(weeks=1)
        else:
            delta = timedelta(days=1)
        
        current_date = start_date
        base_value = 100
        
        while current_date <= datetime.now():
            # Generate realistic-looking data with trend and noise
            trend = (current_date - start_date).days * 0.1
            noise = random.gauss(0, 5)
            seasonal = 10 * np.sin(2 * np.pi * (current_date - start_date).days / 7)
            
            value = base_value + trend + seasonal + noise
            
            data.append({
                'timestamp': current_date.isoformat(),
                'value': round(value, 2),
                'category': random.choice(['A', 'B', 'C']),
                'status': random.choice(['active', 'inactive', 'pending'])
            })
            
            current_date += delta
        
        return data

def generate_sample_data(count: int = 10, data_type: str = 'random') -> List[Dict[str, Any]]:
    """Generate sample data for testing purposes."""
    
    if data_type == 'users':
        return generate_user_data(count)
    elif data_type == 'products':
        return generate_product_data(count)
    elif data_type == 'transactions':
        return generate_transaction_data(count)
    elif data_type == 'timeseries':
        processor = TestDataProcessor()
        return processor.generate_time_series(days=count)
    else:
        return generate_random_data(count)

def generate_user_data(count: int) -> List[Dict[str, Any]]:
    """Generate sample user data."""
    users = []
    
    first_names = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry']
    last_names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez']
    domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'company.com', 'example.org']
    
    for i in range(count):
        first_name = random.choice(first_names)
        last_name = random.choice(last_names)
        
        user = {
            'id': i + 1,
            'first_name': first_name,
            'last_name': last_name,
            'email': f"{first_name.lower()}.{last_name.lower()}@{random.choice(domains)}",
            'age': random.randint(18, 80),
            'registration_date': (datetime.now() - timedelta(days=random.randint(1, 365))).isoformat(),
            'is_active': random.choice([True, False]),
            'score': round(random.uniform(0, 100), 2)
        }
        users.append(user)
    
    return users

def generate_product_data(count: int) -> List[Dict[str, Any]]:
    """Generate sample product data."""
    products = []
    
    categories = ['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports', 'Toys', 'Food', 'Beauty']
    brands = ['BrandA', 'BrandB', 'BrandC', 'BrandD', 'BrandE']
    
    for i in range(count):
        product = {
            'id': i + 1,
            'name': f"Product {i + 1}",
            'category': random.choice(categories),
            'brand': random.choice(brands),
            'price': round(random.uniform(10, 1000), 2),
            'stock_quantity': random.randint(0, 100),
            'rating': round(random.uniform(1, 5), 1),
            'created_date': (datetime.now() - timedelta(days=random.randint(1, 730))).isoformat(),
            'is_available': random.choice([True, False])
        }
        products.append(product)
    
    return products

def generate_transaction_data(count: int) -> List[Dict[str, Any]]:
    """Generate sample transaction data."""
    transactions = []
    
    payment_methods = ['credit_card', 'debit_card', 'paypal', 'bank_transfer', 'cash']
    statuses = ['completed', 'pending', 'failed', 'refunded']
    
    for i in range(count):
        transaction = {
            'id': f"TXN{str(i + 1).zfill(6)}",
            'user_id': random.randint(1, 1000),
            'amount': round(random.uniform(5, 500), 2),
            'currency': random.choice(['USD', 'EUR', 'GBP', 'CAD']),
            'payment_method': random.choice(payment_methods),
            'status': random.choice(statuses),
            'transaction_date': (datetime.now() - timedelta(days=random.randint(1, 90))).isoformat(),
            'description': f"Transaction for order #{random.randint(1000, 9999)}"
        }
        transactions.append(transaction)
    
    return transactions

def generate_random_data(count: int) -> List[Dict[str, Any]]:
    """Generate completely random data."""
    data = []
    
    for i in range(count):
        item = {
            'id': i + 1,
            'random_string': ''.join(random.choices(string.ascii_letters, k=10)),
            'random_number': random.randint(1, 1000),
            'random_float': round(random.uniform(0, 100), 3),
            'random_boolean': random.choice([True, False]),
            'random_date': (datetime.now() - timedelta(days=random.randint(1, 365))).isoformat(),
            'random_choice': random.choice(['option1', 'option2', 'option3', 'option4']),
            'nested_data': {
                'sub_field1': random.randint(1, 10),
                'sub_field2': ''.join(random.choices(string.ascii_lowercase, k=5))
            }
        }
        data.append(item)
    
    return data

def validate_json_schema(data: Any, schema: Dict[str, Any]) -> Dict[str, Any]:
    """Validate data against a JSON schema (requires jsonschema package)."""
    try:
        import jsonschema
        jsonschema.validate(data, schema)
        return {'valid': True, 'errors': []}
    except ImportError:
        return {'valid': False, 'errors': ['jsonschema package not available']}
    except jsonschema.ValidationError as e:
        return {'valid': False, 'errors': [str(e)]}
    except Exception as e:
        return {'valid': False, 'errors': [f'Validation error: {str(e)}']}

def format_data_for_export(data: List[Dict[str, Any]], format_type: str = 'json') -> Union[str, bytes]:
    """Format data for export in various formats."""
    if format_type == 'json':
        return json.dumps(data, indent=2, default=str)
    elif format_type == 'csv':
        df = pd.DataFrame(data)
        return df.to_csv(index=False)
    elif format_type == 'excel':
        df = pd.DataFrame(data)
        # Return as bytes for Excel format
        import io
        output = io.BytesIO()
        df.to_excel(output, index=False)
        return output.getvalue()
    else:
        return json.dumps(data, default=str)